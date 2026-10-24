import {describe,expect,it} from 'vitest';
import {normalizedBrandKey,productEligibility,productAgeReference,nonnegativeMetric} from '@/lib/data-normalization';
import {normalizeOrder,type OrderPolicy} from '@/lib/connectors/order-normalization';
import type {OrderDto} from '@/lib/connectors/contract';
const policy:OrderPolicy={statuses:{'5':'SALE','7':'RETURN'},channels:{'1':'Web'},amounts:{price:'gross_unit',absoluteDiscount:'line',currency:'UAH',cost:'unit'}};
function order(quantity='2',status='5'):OrderDto{return{externalId:'1',observedAt:'2026-10-24T12:00:00Z',updatedAt:null,orderedAt:'2026-10-20',paidAt:'2026-10-21',statusId:status,channelId:'1',raw:{},lines:[{externalLineId:'1',productId:null,sku:'SKU1',quantity,unitPrice:'100',discount:'0',discountUnit:'amount',commission:null,commissionUnit:'unknown',costPrice:'40'}]};}
describe('MVP normalization rules',()=>{
 it.each([['SEIKO','Seiko'],['BRISTON','Briston'],['ZEISS','Zeiss'],['UNIMATIC','Unimatic'],['ARTHUSS','ArtHuss'],['СЕМЕН ШИРОЧИН','Семен Широчин']])('normalizes reference brand %s / %s', (a,b)=>{expect(normalizedBrandKey(` ${b} `)).toBe(a);});
 it('retains blank brands as the unbranded group and does not invent aliases',()=>{expect(normalizedBrandKey(' ')).toBeNull();expect(normalizedBrandKey(' CIGA DESIGN ')).not.toBe(normalizedBrandKey('CIGADESIGN'));});
 it('separates services, gift cards, merchandise and unverified types',()=>{
  expect(productEligibility('GIFT_CARD')).toMatchObject({isGiftCard:true,merchandiseRevenue:false,merchandiseMargin:false,stock:false,classification:false});
  expect(productEligibility('SERVICE')).toMatchObject({isService:true,serviceRevenue:true,stock:false,classification:false});
  expect(productEligibility('UNKNOWN').merchandiseRevenue).toBe(false);expect(productEligibility('MERCHANDISE').stock).toBe(true);
 });
 it('uses a labelled first-sale proxy without changing a verified receipt/cohort',()=>{
  const observed=new Date('2026-10-24'),sale=new Date('2026-10-01'),receipt=new Date('2026-10-10');
  expect(productAgeReference(null,sale,observed)).toMatchObject({date:sale,basis:'FIRST_SALE_PROXY',inferred:true});
  expect(productAgeReference(receipt,sale,observed)).toMatchObject({date:receipt,basis:'VERIFIED_RECEIPT',inferred:false});
  expect(productAgeReference(new Date('2026-10-25'),sale,observed)).toMatchObject({date:null,issue:'NEGATIVE_PRODUCT_AGE'});
  expect(productAgeReference(null,null,observed).date).toBeNull();
 });
 it('retains invalid and negative metrics as exceptions rather than zero',()=>{expect(nonnegativeMetric('-1')).toEqual({value:null,issue:'NEGATIVE_METRIC'});expect(nonnegativeMetric('bad').value).toBeNull();expect(nonnegativeMetric('0').value?.toString()).toBe('0');});
 it.each(['2','-2'])('signs verified returns once for source quantity %s',quantity=>{
  const value={...order(quantity,'7'),returnedAt:'2026-10-23'};const result=normalizeOrder(value,'Europe/Kyiv',policy);
  expect(result.valid).toBe(true);expect(result.lines[0].signedQuantity?.toString()).toBe('-2');expect(result.lines[0].signedRevenue?.toString()).toBe('-200');expect(result.lines[0].signedCost?.toString()).toBe('-80');
 });
 it('retains signed corrections without product/category matching and never guesses a return date from updateAt',()=>{
  const result=normalizeOrder(order('-2'),'Europe/Kyiv',policy);expect(result.valid).toBe(true);expect(result.lines[0].signedRevenue?.toString()).toBe('-200');expect(result.issues).toContain('SIGNED_CORRECTION');
  const returned=normalizeOrder({...order('2','7'),updatedAt:'2026-10-23'},'Europe/Kyiv',policy);expect(returned.lines[0].signedRevenue).toBeNull();expect(returned.issues).toContain('RETURN_DATE_UNAVAILABLE');
 });
 it('requires explicit date fallback approval and retains unknown cost/quantity',()=>{
  const value={...order(),paidAt:null};expect(normalizeOrder(value,'Europe/Kyiv',policy).lines[0].signedRevenue).toBeNull();
  expect(normalizeOrder(value,'Europe/Kyiv',{...policy,dates:{saleOrderTimeFallback:true}}).lines[0]).toMatchObject({dateInferred:true});
  const invalid=order();invalid.lines[0].quantity=null;const result=normalizeOrder(invalid,'Europe/Kyiv',policy);expect(result.valid).toBe(false);expect(result.lines[0].quantity).toBeNull();
  const free=order();free.lines[0].costPrice='0';expect(normalizeOrder(free,'Europe/Kyiv',policy).lines[0].costAmount).toBeNull();
 });
});

describe('signed discount magnitude',()=>{
 it.each(['2','-2'])('does not double-apply the sign to a discounted return %s',quantity=>{
  const value={...order(quantity,'7'),returnedAt:'2026-10-23'};value.lines[0].discount='10';
  expect(normalizeOrder(value,'Europe/Kyiv',policy).lines[0].signedRevenue?.toString()).toBe('-190');
 });
});

import {snapshotStock,canClassifyProduct} from '@/lib/classify';
describe('classification input exclusions',()=>{
 it('keeps fractional stock and rejects unknown/negative stock',()=>{expect(snapshotStock({quantity:'2.5',qtyOnHand:null})).toBe(2.5);expect(snapshotStock({quantity:null,qtyOnHand:null})).toBeNull();expect(canClassifyProduct({productKind:'MERCHANDISE'},null)).toBe(false);expect(canClassifyProduct({productKind:'MERCHANDISE'},-1)).toBe(false);});
 it.each(['SERVICE','GIFT_CARD'])('excludes %s from legacy stock/classification paths',kind=>{expect(canClassifyProduct({productKind:kind},128)).toBe(false);});
 it('requires a verified imported product type while retaining legacy type behavior',()=>{expect(canClassifyProduct({productKind:'UNKNOWN',catalogAttributes:{sourceId:'salesdrive'}},2)).toBe(false);expect(canClassifyProduct({productKind:'UNKNOWN',catalogAttributes:{}},2)).toBe(true);});
});

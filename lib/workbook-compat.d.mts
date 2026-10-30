export declare function worksheetCell(sheet: any, row: any, column: any): any;
export declare function readWorkbook(buffer: Buffer | ArrayBuffer | Uint8Array, options?: import("xlsx").ParsingOptions): import("xlsx").WorkBook;
export declare function sheetToJson<T>(sheet: import("xlsx").WorkSheet, options?: import("xlsx").Sheet2JSONOpts): T[];

import {afterEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({open:vi.fn(),anthropic:vi.fn(),createOpen:vi.fn(),createAnthropic:vi.fn()}));
vi.mock("openai",()=>({default:class {chat={completions:{create:m.createOpen}};constructor(options:unknown){m.open(options);}}}));
vi.mock("@anthropic-ai/sdk",()=>({default:class {messages={create:m.createAnthropic};constructor(options:unknown){m.anthropic(options);}}}));
import {chat,chatWithUsage} from "@/lib/ai";
const keys={open:process.env.OPENAI_API_KEY,anthropic:process.env.ANTHROPIC_API_KEY};
afterEach(()=>{vi.clearAllMocks();
  if(keys.open===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keys.open;
  if(keys.anthropic===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=keys.anthropic;
});
const messages=[{role:"user" as const,content:"Synthetic prompt"}];
describe("metered one-attempt AI transport",()=>{
  it("disables hidden OpenAI retries and separates cached prompt tokens from uncached input",async()=>{
    process.env.OPENAI_API_KEY="synthetic-key";
    m.createOpen.mockResolvedValue({id:"completion-id",model:"resolved-model",choices:[{message:{content:"text"},finish_reason:"stop"}],usage:{prompt_tokens:150,completion_tokens:20,prompt_tokens_details:{cached_tokens:50}}});
    expect(await chatWithUsage({provider:"openai",model:"approved-model",messages,maxTokens:100})).toMatchObject({text:"text",model:"resolved-model",requestId:"completion-id",complete:true,quality:"EXACT",usage:{input:100,output:20,cacheRead:50,cacheWrite:0}});
    expect(m.open).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0}));
    expect(m.createOpen).toHaveBeenCalledTimes(1);
  });
  it("preserves Anthropic cache categories, resolved model and explicit output cap",async()=>{
    process.env.ANTHROPIC_API_KEY="synthetic-key";
    m.createAnthropic.mockResolvedValue({id:"message-id",model:"served-model",stop_reason:"end_turn",content:[{type:"text",text:"text"}],usage:{input_tokens:100,output_tokens:20,cache_read_input_tokens:50,cache_creation_input_tokens:10}});
    expect(await chatWithUsage({provider:"anthropic",model:"approved-model",messages,maxTokens:100})).toMatchObject({complete:true,usage:{input:100,output:20,cacheRead:50,cacheWrite:10},model:"served-model"});
    expect(m.anthropic).toHaveBeenCalledWith(expect.objectContaining({maxRetries:0}));
    expect(m.createAnthropic).toHaveBeenCalledWith(expect.objectContaining({model:"approved-model",max_tokens:100}));
  });
  it("does not fabricate usage when OpenAI omits it and marks truncation",async()=>{
    process.env.OPENAI_API_KEY="synthetic-key";
    m.createOpen.mockResolvedValue({id:"truncated",model:"model",choices:[{message:{content:"partial"},finish_reason:"length"}]});
    const result=await chatWithUsage({provider:"openai",model:"model",messages});
    expect(result.usage).toBeUndefined();expect(result.complete).toBe(false);
  });
  it("preserves the legacy text-only interface and its existing retry configuration",async()=>{
    process.env.OPENAI_API_KEY="synthetic-key";
    m.createOpen.mockResolvedValue({choices:[{message:{content:"legacy text"}}]});
    expect(await chat({providerOverride:"openai",messages})).toBe("legacy text");
    expect(m.open).toHaveBeenCalledWith(expect.objectContaining({maxRetries:1}));
  });
});

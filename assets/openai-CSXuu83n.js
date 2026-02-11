import{a1 as S,w as y,r as T}from"./index-CKnRBt-b.js";const p="md-translate-config",f={baseUrl:"https://api.openai.com/v1",apiKey:"",modelName:"gpt-4o-mini",translateMarkdownCodeBlocks:!1},R=S("config",()=>{const o=T({...f});function e(){try{const n=localStorage.getItem(p);if(n){const l=JSON.parse(n);o.value={...f,...l}}}catch(n){console.error("加载配置失败:",n)}}function i(){try{localStorage.setItem(p,JSON.stringify(o.value))}catch(n){console.error("保存配置失败:",n)}}function u(){o.value={...f}}return y(o,i,{deep:!0}),e(),{config:o,loadFromStorage:e,saveToStorage:i,reset:u}});function v(o){const e=o.replace(/\/$/,"");return e.endsWith("/v1")?`${e}/chat/completions`:`${e}/v1/chat/completions`}function O(o){const e={"Content-Type":"application/json"};return o&&(e.Authorization=`Bearer ${o}`),e}function b(o){return o instanceof TypeError&&(o.message.includes("fetch")||o.message.includes("CORS")||o.message.includes("Failed to fetch")||o.message.includes("NetworkError"))}function A(){return`CORS 错误：浏览器无法直接访问该 API。

可能的原因：
1. API 服务器未配置 CORS 头
2. 需要配置代理服务器

解决方案：
1. 使用支持 CORS 的代理服务器（如 Cloudflare Worker）
2. 在配置中设置代理 URL
3. 联系 API 提供商启用 CORS

示例代理配置：
https://github.com/your-proxy-server`}function k(o){return o.name==="AbortError"||o instanceof Error&&o.message.includes("aborted")}async function $(o){const{baseUrl:e,apiKey:i,model:u,messages:n,temperature:l,max_tokens:C,timeoutMs:m=12e4}=o,E=v(e),g={model:u,messages:n,temperature:l,max_tokens:C},d=new AbortController,w=setTimeout(()=>d.abort(),m);try{const t=await fetch(E,{method:"POST",headers:O(i),body:JSON.stringify(g),signal:d.signal}),a=await t.text();if(!t.ok){const s=new Error(`API error ${t.status}: ${a}`);throw s.statusCode=t.status,s.isCorsError=!1,s.isTimeout=!1,s}const h=JSON.parse(a).choices?.[0]?.message?.content;if(!h){const s=new Error("Empty response content from API");throw s.statusCode=void 0,s.isCorsError=!1,s.isTimeout=!1,s}return h}catch(t){if(t instanceof Error){const c=t;if(b(t)){const r=new Error(A());throw r.isCorsError=!0,r.isTimeout=!1,r.statusCode=void 0,r}if(k(t)){const r=new Error(`请求超时（${m}ms）：服务器响应时间过长，请稍后重试或尝试减少文本长度`);throw r.isTimeout=!0,r.isCorsError=!1,r.statusCode=void 0,r}throw c.isCorsError=!1,c.isTimeout=!1,c}const a=new Error("Unknown error occurred");throw a.isCorsError=!1,a.isTimeout=!1,a.statusCode=void 0,a}finally{clearTimeout(w)}}export{$ as c,R as u};

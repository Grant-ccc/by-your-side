const { chromium }=require('playwright');
const { mkdir }=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'msedge'})});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:17400');await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:'聊天',exact:true}).click();
  await page.getByText('暂时不能读取或保存消息',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('聊天消息').isDisabled(),true);
  await mkdir('.local/screenshots',{recursive:true});
  await page.screenshot({path:'.local/screenshots/react-database-unavailable.png'});
  // Browser-only fixtures verify interaction, not MySQL connectivity or AI.
  const conversationId=randomUUID(),saved=[],requestIds=[];
  let failFirst=true;
  await page.route('**/health',route=>route.fulfill({json:{status:'ok',database:'connected',ai:'not-configured',mode:'local-development'}}));
  await page.route('**/api/bootstrap',route=>route.fulfill({json:{conversations:[{id:conversationId,title:'测试会话',createdAt:new Date().toISOString()}],capabilities:{ai:false,storage:'mysql',authentication:'local-only'}}}));
  await page.route('**/api/conversations/*/messages*',async route=>{
   const request=route.request();
   if(request.method()==='GET')return route.fulfill({json:{messages:saved,nextCursor:saved.at(-1)?.sequence||0,hasMore:false}});
   const input=request.postDataJSON();requestIds.push(input.clientRequestId);
   let message=saved.find(m=>m.clientRequestId===input.clientRequestId);
   const duplicate=!!message;
   if(!message){message={id:randomUUID(),conversationId,sequence:saved.length+1,clientRequestId:input.clientRequestId,text:input.text,role:'user',status:'saved',createdAt:new Date().toISOString()};saved.push(message)}
   if(failFirst){failFirst=false;return route.abort('failed')}
   return route.fulfill({status:duplicate?200:201,json:{message,duplicate,ai:'not-configured'}});
  });
  await page.reload();await page.getByRole('button',{name:'聊天',exact:true}).click();
  await page.getByText('本地消息存储已连接',{exact:true}).waitFor();
  await page.getByLabel('聊天消息').fill('今天也想把小事慢慢告诉你 🧸');await page.getByRole('button',{name:'保存消息',exact:true}).click();
  await page.getByRole('button',{name:'重试保存（不会重复写入）'}).waitFor();
  assert.equal(await page.getByLabel('聊天消息').isDisabled(),true);
  await page.getByRole('button',{name:'重试保存（不会重复写入）'}).click();
  await page.locator('.message-state').filter({hasText:'已存入数据库'}).waitFor();
  assert.equal(saved.length,1);assert.equal(requestIds[0],requestIds[1]);
  await page.reload();await page.getByRole('button',{name:'聊天',exact:true}).click();await page.getByText(saved[0].text,{exact:true}).waitFor();
  assert.equal(await page.locator('.bubble').count(),1);
  await page.getByRole('button',{name:'日常',exact:true}).click();
  await page.getByRole('tab',{name:'习惯打卡'}).click();await page.getByRole('button',{name:'记录 ＋'}).first().click();await page.getByText('本次预览已记录 1 次',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'备忘录'}).click();await page.getByRole('heading',{name:'留一段共同的时间'}).waitFor();
  await page.getByRole('button',{name:'回忆',exact:true}).click();await page.getByRole('heading',{name:'第一段回忆，正在路上'}).waitFor();
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('heading',{name:'本阶段已经接入'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'日常',exact:true}).click();await page.screenshot({path:'.local/screenshots/react-mobile.png'});
  await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'.local/screenshots/react-desktop.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: real database-unavailable UI; fixture retry request ID, persisted history rendering, navigation, tabs, narrow layout; zero page errors. Fixtures do not verify MySQL.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

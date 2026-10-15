const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'msedge'})});
 const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const expectText=async text=>{await page.getByText(text,{exact:true}).first().waitFor({state:'visible',timeout:5000})};
 try{
 await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);await page.waitForLoadState('networkidle');
 await page.evaluate(()=>{localStorage.removeItem('private-days-prototype-v1');location.reload()});await page.waitForLoadState('networkidle');
 await expectText('日常记录');await page.screenshot({path:path.join(__dirname,'桌面原型预览.png')});
 await page.getByRole('tab',{name:'习惯打卡'}).click();await page.locator('[data-check="2"]').click();await expectText('今天已记录 1 次');
 await page.getByRole('button',{name:'＋ 添加自己的习惯'}).click();await page.getByLabel('习惯名称').fill('散步');await page.getByRole('button',{name:'添加习惯',exact:true}).click();await expectText('散步');
 await page.getByRole('tab',{name:'备忘录'}).click();await page.getByRole('button',{name:'＋ 课表 / 考试 / 待办'}).click();await page.getByLabel('内容',{exact:true}).fill('算法考试');await page.getByLabel('日期与时间').fill('2026-10-20T09:00');await page.getByRole('button',{name:'保存安排'}).click();await expectText('算法考试');
 await page.locator('.topbar [data-go="settings"]').click();await page.getByLabel('他怎么称呼你').fill('小同学');await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.reload();await page.getByRole('button',{name:'日常',exact:true}).click();await expectText('小同学');
 await page.locator('.topbar [data-go="settings"]').click();await page.getByRole('button',{name:'查看与纠正记忆'}).click();await page.getByRole('button',{name:'修改',exact:true}).click();await page.getByLabel('你希望他记住的内容').fill('喜欢少糖饮料');await page.getByRole('button',{name:'保存修改'}).click();await expectText('喜欢少糖饮料');
 await page.getByRole('button',{name:'确认约定',exact:true}).click();await page.getByLabel('日期与时间').fill('2026-10-16T20:00');await page.getByRole('button',{name:'确认并留出时间'}).click();await expectText('2026-10-16 20:00 一起看电影');
 await page.getByRole('button',{name:'删除',exact:true}).first().click();await page.getByRole('button',{name:'确认删除',exact:true}).click();assert.equal(await page.getByText('喜欢少糖饮料',{exact:true}).count(),0);
 await page.getByRole('button',{name:'日常',exact:true}).click();await page.getByRole('tab',{name:'日常记录'}).click();await page.getByRole('button',{name:'下次外出'}).click();await page.locator('[data-item="pen"]').click();await page.getByRole('button',{name:'就带上这件'}).click();await page.getByRole('button',{name:'演示一次出行见闻'}).click();await expectText('携带物品：钢笔');await page.getByRole('button',{name:'查看日常记录',exact:true}).click();await expectText('路过书店，用携带的钢笔在书签上写下一句留言。');
 await page.locator('#desktop-controls [data-demo="busy"]').click();await page.getByLabel('聊天消息').fill('我这里下雨了');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByLabel('聊天消息').fill('先给你留个言');await page.getByRole('button',{name:'发送',exact:true}).click();assert.equal(await page.locator('.message-state').filter({hasText:'未读'}).count(),2);await page.getByRole('button',{name:'忙完回来 →',exact:true}).click();await expectText('原型先用这组示例回应；你的话已经保留，正式版会由 AI 接着聊。');
 await page.getByRole('button',{name:'重新回复 ↻'}).click();await expectText('嗯，刚才那句重新说。今天有什么想和我分享的？');assert.equal(await page.getByText('原型先用这组示例回应；你的话已经保留，正式版会由 AI 接着聊。',{exact:true}).count(),0);
 await page.getByRole('button',{name:'现在想找你',exact:true}).click();await page.locator('.chat-banner').filter({hasText:'正在陪伴你'}).waitFor({state:'visible'});await page.getByRole('button',{name:'结束陪伴',exact:true}).click();assert.equal(await page.getByText('正在陪伴你',{exact:true}).count(),0);
 await page.getByRole('button',{name:'回忆',exact:true}).click();await page.getByRole('button',{name:'留下一张回忆',exact:true}).click();await expectText('本周 2 / 2');await page.getByRole('button',{name:'留下一张回忆',exact:true}).click();assert.equal(await page.locator('.photo-card').count(),4);
 await page.locator('#desktop-controls [data-demo="budget"]').click();await expectText('本月额度已到上限');assert.equal(await page.getByLabel('聊天消息').isDisabled(),true);
 await page.locator('#desktop-controls [data-demo="normal"]').click();await page.locator('.topbar [data-go="settings"]').click();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出备份',exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(__dirname,'测试备份.json'));
 await page.locator('#desktop-controls [data-demo="reset"]').click();await page.getByRole('button',{name:'确认重置示例'}).click();await page.locator('.topbar [data-go="settings"]').click();await page.locator('#restore-file').setInputFiles(path.join(__dirname,'测试备份.json'));await page.getByRole('button',{name:'确认替换',exact:true}).click();assert.equal(await page.getByLabel('他怎么称呼你').inputValue(),'小同学');
 // Restore the clean example so the delivered preview has no test data.
 await page.locator('#desktop-controls [data-demo="reset"]').click();await page.getByRole('button',{name:'确认重置示例'}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'手机原型预览.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.getByRole('button',{name:'聊天',exact:true}).click();await page.screenshot({path:path.join(__dirname,'手机聊天预览.png')});
 assert.equal(await page.getByLabel('聊天消息').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: navigation, habits, schedules, persistence, memory edit/delete, promise, item event, busy batch reply, retry, companion, photo limit, budget stop, export/restore, 390px layout; no page errors.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

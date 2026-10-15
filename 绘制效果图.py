from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math

OUT=Path(__file__).parent/'效果图_暖红版'
OUT.mkdir(exist_ok=True)
S=2; W=480; H=1040
C={'wine':'#A33232','deep':'#692B27','rose':'#C77F73','pink':'#F3D9D0','pale':'#FBEDE5','paper':'#FFFBF5','ink':'#493A35','muted':'#947D73','line':'#EAC9BB','green':'#687F70','char':'#49403C'}
def font(n,b=False): return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if b else 'C:/Windows/Fonts/msyh.ttc',round(n*S))
def box(v): return tuple(round(x*S) for x in v)
def rr(d,r,fill,rad=16,outline=None,width=1): d.rounded_rectangle(box(r),radius=rad*S,fill=fill,outline=outline,width=width*S)
def line(d,p,fill=C['line'],width=1): d.line([(int(x*S),int(y*S)) for x,y in p],fill=fill,width=width*S)
def tx(d,x,y,t,n=15,c=None,b=False,anchor=None): d.text((x*S,y*S),t,font=font(n,b),fill=c or C['ink'],anchor=anchor)
def dot(d,x,y,r,c): d.ellipse(box((x-r,y-r,x+r,y+r)),fill=c)
def pill(d,x,y,t,fill=None,c=None,w=None):
    w=w or (d.textlength(t,font=font(12))/S+22)
    rr(d,(x,y,x+w,y+27),fill or C['pale'],13)
    tx(d,x+w/2,y+5,t,12,c or C['wine'],anchor='mt')
def icon(d,x,y,name,col=None,s=22):
    col=col or C['wine']; k=s/22
    def l(p): line(d,[(x+a*k,y+b*k) for a,b in p],col,2)
    if name=='home': l([(1,10),(11,1),(21,10)]);l([(4,9),(4,21),(18,21),(18,9)]);l([(9,21),(9,14),(14,14),(14,21)])
    elif name=='chat': rr(d,(x,y+1,x+s,y+s-3),None,5,col,2);l([(5,19),(5,23),(10,19)]);dot(d,x+6*k,y+9*k,1,col);dot(d,x+11*k,y+9*k,1,col);dot(d,x+16*k,y+9*k,1,col)
    elif name=='album': rr(d,(x,y,x+s,y+s),None,4,col,2);l([(3,18),(9,11),(13,15),(17,9),(21,14)]);dot(d,x+7*k,y+6*k,2,col)
    elif name=='back': l([(14,2),(5,11),(14,20)])
    elif name=='check': l([(3,11),(9,17),(20,4)])
    elif name=='plus': l([(11,2),(11,20)]);l([(2,11),(20,11)])
    elif name=='clock': d.ellipse(box((x,y,x+s,y+s)),outline=col,width=2*S);l([(11,5),(11,11),(16,14)])
    elif name=='heart':
        pts=[]
        for i in range(100):
            a=i*math.pi*2/99;pts.append(((x+11+math.sin(a)**3*10)*S,(y+10-(13*math.cos(a)-5*math.cos(2*a)-2*math.cos(3*a)-math.cos(4*a))*.65)*S))
        d.polygon(pts,fill=col)
    elif name=='gear':
        d.ellipse(box((x+3,y+3,x+19,y+19)),outline=col,width=2*S);d.ellipse(box((x+8,y+8,x+14,y+14)),outline=col,width=2*S)
        for a in range(0,360,45):
            a=math.radians(a);l([(11+8*math.cos(a),11+8*math.sin(a)),(11+11*math.cos(a),11+11*math.sin(a))])

def avatar(d,x,y,r=34,who='him'):
    dot(d,x,y,r+3,'#FFFFFF');dot(d,x,y,r,C['pink'] if who=='him' else '#E6DFD6')
    # Deliberately symbolic faces, not a final character portrait.
    if who=='him':
        d.pieslice(box((x-r*.65,y-r*.65,x+r*.65,y+r*.76)),180,360,fill='#3D3338')
        dot(d,x,y+2,r*.44,'#F4D9C9')
        d.polygon([(int((x-r*.55)*S),int((y-3)*S)),(int((x-r*.42)*S),int((y-r*.55)*S)),(int((x+r*.45)*S),int((y-r*.44)*S)),(int((x+r*.5)*S),int((y+2)*S)),(int(x*S),int((y-r*.17)*S))],fill='#3D3338')
        rr(d,(x-r*.48,y+r*.49,x+r*.48,y+r*.86),'#4A3C43',8)
    else:
        dot(d,x,y+1,r*.48,'#F6E7D9');d.arc(box((x-r*.5,y-r*.48,x+r*.5,y+r*.52)),180,360,fill='#A69589',width=6*S)
        rr(d,(x-r*.5,y+r*.5,x+r*.5,y+r*.87),'#C3A6A1',9)
    for a in [-.16,.16]: dot(d,x+r*a,y+r*.12,1.1,'#55424A')
    if who=='him':line(d,[(x-4,y+11),(x+3,y+11)],'#B57C7D',1)

def base(time='11:41',nav='日常',chat=False):
    im=Image.new('RGB',(W*S,H*S),C['paper']);d=ImageDraw.Draw(im)
    for yy in range(48,1000,13):
        for xx in range(7,W,13):dot(d,xx+(6 if yy%26 else 0),yy,.6,'#EFDDDC')
    d.polygon([(0,0),(W*S,0),(W*S,220*S),(0,280*S)],fill=C['pink'])
    d.ellipse(box((-100,180,590,340)),fill=C['paper'])
    tx(d,25,15,time,13,C['deep'],True)
    for i in range(3):rr(d,(383+i*5,25-i*3,386+i*5,29),C['deep'],1)
    rr(d,(405,18,426,29),None,3,C['deep']);rr(d,(408,21,422,26),C['deep'],1);tx(d,434,15,'92%',10,C['deep'])
    if not chat:
        rr(d,(18,56,65,94),'#FFF6F2',12,C['line']);icon(d,31,65,'home')
        tx(d,80,65,'在你身边',19,C['deep'],True);icon(d,432,65,'gear')
    if nav:
        rr(d,(15,958,465,1022),'#FFFDFC',22,C['line'])
        for x,n,ic in [(92,'日常','home'),(240,'聊天','chat'),(388,'回忆','album')]:
            if nav==n:rr(d,(x-47,966,x+47,1015),C['pale'],15)
            icon(d,x-10,970,ic,C['wine'] if nav==n else C['muted'],19)
            tx(d,x,994,n,11,C['wine'] if nav==n else C['muted'],nav==n,anchor='mt')
    return im,d

def header(d,title,sub=None):
    icon(d,25,65,'back');tx(d,240,62,title,20,C['deep'],True,anchor='mt');tx(d,440,62,'···',20,C['wine'])
    if sub:tx(d,240,93,sub,11,C['muted'],anchor='mt')
def panel(d,y,h,title,right=None):
    rr(d,(19,y+3,461,y+h+3),'#EAD8D5',20)
    rr(d,(18,y,462,y+h),C['paper'],20,C['line'])
    rr(d,(29,y+12,451,y+48),C['char'],12)
    dot(d,43,y+30,3,C['pink']);tx(d,55,y+19,title,14,C['pink'])
    if right:tx(d,437,y+21,right,11,'#F3E4E4',anchor='rt')
def tabs(d,y,active=0):
    for i,t in enumerate(['日常记录','习惯打卡','备忘录']):
        x=24+i*145;rr(d,(x,y,x+142,y+48),C['paper'] if i==active else C['pink'],14,C['line']);tx(d,x+71,y+13,t,16,C['wine'],i==active,anchor='mt')
def pair(d):
    avatar(d,91,159,43);avatar(d,211,159,43,'you')
    tx(d,91,211,'李泽言',15,C['wine'],True,anchor='mt');tx(d,211,211,'你',15,C['wine'],anchor='mt')
    icon(d,144,145,'heart',C['rose'],17)
    tx(d,326,130,'相伴的日常',12,C['muted']);tx(d,326,156,'慢慢收藏',23,C['wine'],True)
    pill(d,323,198,'称呼与日期待填写',w=132)
def button(d,r,t,solid=True):
    rr(d,r,C['wine'] if solid else C['pale'],13,None if solid else C['line']);tx(d,(r[0]+r[2])/2,r[1]+12,t,15,'#FFFFFF' if solid else C['wine'],True,anchor='mt')
def wrap(d,t,maxw,n):
    ls=['']
    for ch in t:
        if ch=='\n':ls.append('');continue
        if d.textlength(ls[-1]+ch,font=font(n))/S>maxw and ch not in '，。！？、；：”）…':ls.append(ch)
        else:ls[-1]+=ch
    return ls
def bubble(d,y,t,side='him',state=None):
    ls=wrap(d,t,264,16);bw=max(d.textlength(l,font=font(16))/S for l in ls)+30; bh=22*len(ls)+24
    x=65 if side=='him' else 415-bw
    avatar(d,34 if side=='him' else 446,y+17,17,'him' if side=='him' else 'you')
    rr(d,(x,y,x+bw,y+bh),'#FFFFFF' if side=='him' else '#EDC9BD',14,C['line'])
    for i,l in enumerate(ls):tx(d,x+15,y+11+i*22,l,16)
    if state:tx(d,x+bw,y+bh+6,state,10,C['muted'],anchor='rt')
    return y+bh+24
def inputbar(d,mode=False):
    rr(d,(0,872,480,946),C['paper'],0,C['line'])
    rr(d,(17,886,367,933),'#FFFFFF',14,C['line']);tx(d,33,900,'想和他说点什么…',14,C['muted']);button(d,(379,887,463,932),'发送')
    pill(d,171,830,'结束陪伴' if mode else '现在想找你',w=138,fill='#EECFC1' if mode else '#F6E4D8')
def save(im,name):im.save(OUT/(name+'.png'))

# 01 home
im,d=base();pair(d);tabs(d,261)
panel(d,301,177,'此时此刻','10月15日')
dot(d,86,391,34,'#F2D7C8');icon(d,74,378,'heart',C['rose'],25)
tx(d,140,367,'今天也有一点想你',18,C['deep'],True);tx(d,140,403,'把心情留在这里，他会看见。',12,C['muted']);pill(d,140,431,'记录心情  ＋',w=117)
panel(d,494,210,'最新动态','查看全部  ›')
for y,t,detail in [(563,'09:10','开始处理今天的工作'),(612,'10:00','会议进行中'),(661,'11:30','午间休息，稍后回来')]:
    dot(d,46,y+7,3,C['rose']);tx(d,60,y,t,12,C['muted']);tx(d,112,y-2,detail,15)
panel(d,720,207,'出行准备')
for x,a,b in [(36,'本次外出','折叠伞 · 携带中'),(252,'下次外出','为他选一件物品')]:
    rr(d,(x,786,x+191,910),C['pale'],15,C['line']);tx(d,x+15,799,a,13,C['muted']);icon(d,x+19,832,'heart',C['rose'],20);tx(d,x+15,874,b,12,C['wine'])
save(im,'01_日常主页')

# 02 normal chat
im,d=base('12:16',nav='聊天',chat=True);header(d,'李泽言','午间休息 · 可以聊一会儿');tx(d,240,140,'今天 12:16',11,C['muted'],anchor='mt')
y=bubble(d,175,'刚下课，今天终于把那个 bug 找到了！','you','已读')
y=bubble(d,y+16,'找了一上午？')
y=bubble(d,y,'那先让脑袋休息一会儿。午饭吃什么？')
y=bubble(d,y+12,'还没想好，你吃了吗？','you','已读')
y=bubble(d,y+15,'刚吃过。今天换你关心我了？')
rr(d,(65,y,134,y+37),'#FFFFFF',13,C['line']);tx(d,81,y+4,'···',23,C['rose']);tx(d,148,y+10,'正在输入…',11,C['muted'])
inputbar(d);save(im,'02_日常聊天')

# 03 busy waiting
im,d=base('10:23',nav='聊天',chat=True);header(d,'李泽言','会议中 · 预计 11:00 后空闲')
rr(d,(25,139,455,200),C['pale'],15,C['line']);icon(d,41,157,'clock');tx(d,77,150,'他正在忙，消息已经送达',14,C['wine'],True);tx(d,77,175,'回来后，会一起看你留下的话。',11,C['muted'])
y=bubble(d,235,'今天上课遇到一个好难的问题。','you','未读')
y=bubble(d,y+8,'先留给你，我再试试。','you','未读')
y=bubble(d,y+8,'不过刚刚食堂的饭还挺好吃！','you','未读')
tx(d,240,573,'各自忙碌，也可以慢慢说。',12,C['muted'],anchor='mt')
rr(d,(32,658,448,776),'#F7EEEA',17,C['line']);pill(d,49,675,'另一种状态',w=104);tx(d,49,714,'已读 · 暂未回复',15,C['wine'],True);tx(d,49,745,'偶尔抽空看见，忙完再认真回你。',12,C['muted'])
inputbar(d);save(im,'03_忙碌与等待')

# 04 companion
im,d=base('16:08',nav='聊天',chat=True);header(d,'李泽言','这会儿，我听你说')
pill(d,173,138,'正在陪伴你',w=134,fill='#EECFC1')
y=bubble(d,199,'今天好烦，先别讲道理，陪我一会儿。','you','已读')
y=bubble(d,y+15,'好，先不讲。')
y=bubble(d,y,'想说就说，我听着。')
y=bubble(d,y+10,'其实就是忙了一天，好像什么都没做完。','you','已读')
y=bubble(d,y+15,'你已经忙了一天，不会因为什么没做完，就变成白费。')
y=bubble(d,y,'现在不想说也没关系。')
inputbar(d,True);save(im,'04_需要陪伴时')

# 05 habits
im,d=base('20:10');pair(d);tabs(d,261,1);panel(d,301,503,'习惯打卡','自己决定今天的节奏')
for yy,title,sub,done in [(377,'喝水','今天已记录 3 次',True),(490,'运动','散步、跑步，按你的方式来',False),(603,'睡觉','准备睡觉时，再来记一下',False)]:
    rr(d,(36,yy,444,yy+97),'#FFFDFC',15,C['line']);dot(d,71,yy+40,22,C['pale']);icon(d,60,yy+29,'check' if done else 'clock',C['green'] if done else C['rose'])
    tx(d,109,yy+19,title,18,C['deep'],True);tx(d,109,yy+53,sub,11,C['muted']);pill(d,356,yy+33,'已记录' if done else '记录',w=72,c=C['green'] if done else C['wine'])
button(d,(36,727,444,778),'＋  添加自己的习惯',False)
rr(d,(28,828,452,924),C['pale'],18,C['line']);avatar(d,62,864,22);tx(d,99,847,'今天还打算运动，还是想休息？',14);tx(d,99,885,'没有记录，也不代表你没完成。',11,C['muted'])
save(im,'05_习惯打卡')

# 06 memo
im,d=base('19:20');pair(d);tabs(d,261,2);panel(d,301,321,'两人的备忘录','＋ 添加')
pill(d,39,369,'明天 · 共同约定',w=134);tx(d,42,417,'一起看一部电影',22,C['deep'],True);tx(d,42,457,'10月16日  20:00',15,C['muted']);tx(d,42,493,'留一段只属于我们的时间。',14)
line(d,[(40,534),(438,534)]);icon(d,43,557,'check',C['green'],19);tx(d,76,555,'已确认，双方日程已留出时间',13,C['green'])
panel(d,642,280,'我的安排','查看课表  ›')
for yy,date,title in [(709,'周五 09:00','课程安排'),(773,'周五 16:00','完成课程作业'),(837,'周六 19:30','整理下周待办')]:
    tx(d,42,yy,date,11,C['muted']);tx(d,42,yy+23,title,16);line(d,[(40,yy+53),(438,yy+53)])
save(im,'06_约定与安排')

def umbrella(d,cx,cy,scale=1):
    d.pieslice(box((cx-31*scale,cy-34*scale,cx+31*scale,cy+26*scale)),180,360,fill=C['wine']);line(d,[(cx,cy-4*scale),(cx,cy+39*scale)],'#A4806D',2);d.arc(box((cx-13*scale,cy+26*scale,cx,cy+42*scale)),0,180,fill='#A4806D',width=2*S)
def cup(d,cx,cy,color):
    rr(d,(cx-23,cy-22,cx+23,cy+20),color,7);d.arc(box((cx+12,cy-17,cx+36,cy+10)),250,100,fill=color,width=5*S);d.ellipse(box((cx-21,cy-25,cx+21,cy-12)),fill='#EAD1B6');line(d,[(cx-31,cy+25),(cx+34,cy+25)],'#C6AD9F',2)
def scene(d,r,kind='cups'):
    x,y,x2,y2=r;rr(d,r,'#E9DBCF',15)
    d.polygon([((x+3)*S,(y+(y2-y)*.6)*S),((x2-3)*S,(y+(y2-y)*.48)*S),((x2-3)*S,(y2-3)*S),((x+3)*S,(y2-3)*S)],fill='#C9B09E')
    if kind=='cups':
        cx=(x+x2)/2;cy=y+(y2-y)*.67;cup(d,cx-43,cy,C['wine']);cup(d,cx+43,cy,'#F5E7D3');d.arc(box((cx-42,cy-64,cx-25,cy-33)),80,270,fill='#FFF5E8',width=2*S)
    elif kind=='sky':
        rr(d,(x+10,y+10,x2-10,y2-13),'#B9C5C4',12);dot(d,x+46,y+40,17,'#F4DFBF');d.polygon([((x+12)*S,(y2-15)*S),((x+80)*S,(y+57)*S),((x2-12)*S,(y2-15)*S)],fill='#758E80')
    elif kind=='dolls':
        for cx,hair,body in [(x+(x2-x)*.33,'#40383D',C['wine']),(x+(x2-x)*.7,'#A89789','#F3DFD1')]:
            dot(d,cx,y+68,34,hair);dot(d,cx,y+74,26,'#F1D6BE');rr(d,(cx-24,y+96,cx+24,y+144),body,19)
            dot(d,cx-8,y+75,2,'#4A3A3E');dot(d,cx+8,y+75,2,'#4A3A3E');dot(d,cx-15,y+83,4,'#E4AFAB');dot(d,cx+15,y+83,4,'#E4AFAB')
    else:
        d.ellipse(box((x+22,y+23,x2-22,y2-16)),fill='#F2E6D8');dot(d,(x+x2)/2,(y+y2)/2,27,'#C88455');dot(d,(x+x2)/2,(y+y2)/2-9,16,'#E7BF7F')

# 07 trip
im,d=base(nav='日常',chat=True);header(d,'为他准备出行','下次外出 · 傍晚散步')
rr(d,(24,140,456,234),C['pale'],18,C['line']);tx(d,43,158,'放一件小物品进他的行李',18,C['deep'],True);tx(d,43,193,'不同的准备，会留下不同的见闻。',12,C['muted'])
for x,y,name,kind in [(25,257,'折叠伞','u'),(248,257,'随行杯','c'),(25,444,'钢笔','p'),(248,444,'相机','a')]:
    rr(d,(x,y,x+207,y+169),'#FFFFFF',18,C['wine'] if kind=='u' else C['line'],2 if kind=='u' else 1)
    if kind=='u':umbrella(d,x+103,y+64);dot(d,x+181,y+24,11,C['wine']);icon(d,x+174,y+17,'check','#FFFFFF',14)
    elif kind=='c':cup(d,x+100,y+70,'#A88389')
    elif kind=='p':line(d,[(x+75,y+98),(x+132,y+39)],C['wine'],10);line(d,[(x+70,y+104),(x+80,y+95)],'#B59A72',4)
    else:rr(d,(x+65,y+39,x+145,y+96),'#B6A6A4',10);dot(d,x+105,y+67,20,'#6C5D62');dot(d,x+105,y+67,12,'#D7C9C3')
    tx(d,x+103,y+132,name,16,C['wine'],anchor='mt')
panel(d,640,178,'折叠伞');tx(d,42,707,'如果沿途遇到雨，',16);tx(d,42,735,'他也可以多走一段喜欢的路。',16);tx(d,42,780,'或许，会带回一段意料之外的小故事。',11,C['muted'])
button(d,(25,853,455,906),'就带上这件');save(im,'07_出行与物品')

# 08 gallery
im,d=base(nav='回忆',chat=True);header(d,'两人的相册','把平常的日子，慢慢留下来')
pill(d,25,137,'全部回忆',w=97,fill=C['pink']);pill(d,133,137,'纪念物',w=83);pill(d,344,137,'本周 1 / 2',w=111)
scene(d,(25,188,455,419),'cups');pill(d,39,202,'构图示意',w=87,fill='#FFF6E9');tx(d,39,438,'留给你的那一杯',20,C['deep'],True);tx(d,39,473,'10.15  ·  晚间的小约定',12,C['muted'])
scene(d,(25,517,232,702),'dolls');scene(d,(248,517,455,702),'sky');tx(d,27,717,'棉花娃娃的合照',14,C['deep'],True);tx(d,250,717,'他路过的傍晚',14,C['deep'],True);tx(d,27,746,'形象待设计 · 构图示意',10,C['muted']);tx(d,250,746,'示例回忆',10,C['muted'])
rr(d,(25,797,455,921),C['pale'],18,C['line']);icon(d,43,817,'heart',C['rose']);tx(d,79,813,'下一张，会是什么时候？',17,C['wine'],True);tx(d,43,855,'它可能来自一段见闻，也可能来自你说的',12,C['muted']);tx(d,43,881,'“我们拍一张吧”。',13,C['wine'])
save(im,'08_共享相册')

# 09 memory
im,d=base(nav='聊天',chat=True);header(d,'关于你的记忆','记得你，也听你的纠正')
pill(d,25,139,'已记住',w=94,fill=C['pink']);pill(d,130,139,'待确认  1',w=106)
rr(d,(25,193,455,339),'#FFFFFF',17,C['line']);pill(d,42,209,'普通偏好 · 自动保存',w=151);tx(d,43,253,'饮料偏好不太甜',18,C['deep'],True);tx(d,43,289,'来自今天 12:24 的聊天',11,C['muted']);tx(d,433,306,'修改  ·  删除',12,C['wine'],anchor='rt')
rr(d,(25,361,455,523),C['pale'],17,C['line']);pill(d,42,379,'重要约定 · 等你确认',w=151);tx(d,43,423,'明晚 20:00 一起看电影',18,C['deep'],True);button(d,(43,468,232,509),'确认约定');button(d,(244,468,436,509),'修改时间',False)
rr(d,(25,546,455,680),'#FFFFFF',17,C['line']);tx(d,43,565,'不确定的内容，不替你下结论',16,C['deep'],True);tx(d,43,603,'暂时的情绪、玩笑和猜测，',13,C['muted']);tx(d,43,630,'不会直接变成你的长期设定。',13,C['muted'])
rr(d,(25,732,455,828),'#F5E2D6',17);icon(d,43,756,'check',C['wine']);tx(d,80,748,'已撤销这条记忆',15,C['wine'],True);tx(d,80,781,'之后不会继续按旧内容理解你。',12,C['muted'])
save(im,'09_记忆与确认')

# 10 notification
im=Image.new('RGB',(W*S,H*S),'#E0C7BB');d=ImageDraw.Draw(im)
for i in range(6):d.ellipse(box((-210+i*40,340+i*40,720-i*25,1200-i*12)),fill=['#DBB8A9','#D09E8B','#C4826E','#B66B56','#A65241','#923E32'][i])
tx(d,240,138,'16:08',78,'#FFF9F3',False,anchor='mt');tx(d,240,243,'10月15日  星期四',17,'#FFF9F3',anchor='mt')
rr(d,(21,340,459,452),'#F8F1EB',22);icon(d,39,357,'heart',C['wine'],18);tx(d,69,356,'在你身边',13,C['deep'],True);tx(d,434,358,'现在',11,C['muted'],anchor='rt');tx(d,40,395,'你有一条新消息',20,C['deep'],True)
rr(d,(49,765,431,871),'#F1E1DF',20);tx(d,240,787,'留一点只属于你们的隐私',16,C['deep'],True,anchor='mt');tx(d,240,824,'通知不显示角色姓名和消息正文',12,C['muted'],anchor='mt')
tx(d,240,973,'向上滑动解锁',12,'#FFF9F3',anchor='mt');save(im,'10_锁屏通知')

# 11 budget
im,d=base(nav='聊天',chat=True);header(d,'李泽言','聊天记录仍然可以查看')
y=bubble(d,161,'回去的路上下了点雨。你挑的伞用上了。');y=bubble(d,y+10,'那就好！','you','已读')
rr(d,(25,360,455,717),C['paper'],22,C['line']);pill(d,43,380,'系统提示',w=88);tx(d,44,429,'本月额度已到上限',23,C['deep'],True);tx(d,44,477,'新的付费生成已暂停。',15);tx(d,44,509,'已有聊天、相册和日程仍可查看。',13,C['muted'])
rr(d,(44,557,436,566),C['pink'],4);rr(d,(44,557,436,566),C['wine'],4);tx(d,44,584,'本月预算',12,C['muted']);tx(d,435,584,'50 元 / 50 元',14,C['wine'],True,anchor='rt');button(d,(44,636,436,689),'查看用量与设置',False)
tx(d,240,751,'下月额度恢复后，可以继续生成新消息。',12,C['muted'],anchor='mt');rr(d,(17,886,463,933),'#EEE7E3',14);tx(d,240,900,'生成已暂停 · 可查看历史消息',13,C['muted'],anchor='mt')
save(im,'11_预算用尽')

# 12 empty state
im,d=base(nav='回忆',chat=True);header(d,'两人的相册','还没有照片，也不必着急')
rr(d,(49,218,431,580),C['pale'],28,C['line']);rr(d,(103,270,377,476),'#FFFDF8',17,C['line']);icon(d,210,329,'album',C['rose'],60);tx(d,240,512,'第一段回忆，正在路上',19,C['wine'],True,anchor='mt')
tx(d,240,633,'日常里的小事，也值得留下。',16,C['deep'],anchor='mt');tx(d,240,675,'以后可以对他说：“我们拍一张吧。”',12,C['muted'],anchor='mt');button(d,(87,739,393,791),'去和他说说话')
rr(d,(25,841,455,926),'#F4E8E4',16);tx(d,44,859,'你的形象可以慢慢设计',14,C['wine'],True);tx(d,44,890,'称呼、生日、纪念日也都可以稍后填写。',11,C['muted'])
save(im,'12_初次使用与空相册')

# Comparison boards, full-resolution individual screens remain available.
groups=[('A_日常与聊天',['01_日常主页','02_日常聊天','03_忙碌与等待'],['01  日常主页','02  自然聊天','03  忙碌 / 已读等待']),('B_陪伴与安排',['04_需要陪伴时','05_习惯打卡','06_约定与安排'],['04  需要陪伴时','05  自定义习惯','06  约定与安排']),('C_物品与回忆',['07_出行与物品','08_共享相册','09_记忆与确认'],['07  物品影响见闻','08  两人的相册','09  记忆与确认']),('D_通知与边界',['10_锁屏通知','11_预算用尽','12_初次使用与空相册'],['10  隐私通知','11  预算到上限','12  第一次打开'])]
for name,files,labels in groups:
    board=Image.new('RGB',(1640,1280),'#F4E9E0');bd=ImageDraw.Draw(board)
    def bt(x,y,t,n,c=C['deep'],b=False):bd.text((x,y),t,font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if b else 'C:/Windows/Fonts/msyh.ttc',n),fill=c)
    bt(49,27,'在你身边  /  暖红色静态效果',29,b=True);bt(49,72,'基于参考布局 · 画面与对话为设计示例 · 头像非最终形象',16,C['muted']);bt(1470,34,name[0]+' / 04',20,C['wine'])
    for i,(f,l) in enumerate(zip(files,labels)):
        x=49+i*532;bt(x,113,l,19,b=True)
        scr=Image.open(OUT/(f+'.png')).resize((480,1040),Image.Resampling.LANCZOS)
        bd.rounded_rectangle((x-6,153,x+486,1205),radius=27,fill='#D9BBB0');board.paste(scr,(x,159))
    bt(49,1233,'静态视觉提案 v0.2  ·  尚未接入 AI / 通知服务  ·  照片为构图示意',15,C['muted'])
    board.save(OUT/(name+'.png'))
print('Created 12 screens and 4 comparison boards in '+str(OUT))

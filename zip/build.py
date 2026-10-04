# 郵便番号 → お住まいの場所 のデータを、上3桁ごとに小分けして書き出す
# 出どころ: 郵便番号と住所の対応＝日本郵便（2026-10-03版）／町名ごとの場所＝geolonia japanese-addresses（MIT）
import json,os,sys,collections
out=json.load(open('zip_points.json'))
dst=sys.argv[1]; os.makedirs(dst,exist_ok=True)
files=collections.defaultdict(dict)
TOWN_OK=('町名ぴったり','丁目をまとめた','同じ町名でまとめた')
for z,v in out.items():
    if len(z)!=7: continue
    pref,city,town,la,lo,how=v
    t = '' if how.startswith(('市区町村','町名なし')) else town
    # かっこの中の注記は人に見せないので落とす
    for ch in ('（','('):
        if ch in t: t=t.split(ch)[0]
    files[z[:3]][z[3:]]=[pref,city,t,la,lo,1 if how in TOWN_OK else 0]
tot=0
for k,v in files.items():
    p=os.path.join(dst,k+'.json')
    open(p,'w',encoding='utf-8').write(json.dumps(v,ensure_ascii=False,separators=(',',':')))
    tot+=os.path.getsize(p)
print('書き出したファイル数 %d ／ 郵便番号 %d件 ／ 合計 %.1f MB ／ 1ファイル平均 %.1f KB'%(
    len(files), sum(len(v) for v in files.values()), tot/1048576, tot/len(files)/1024))
sizes=sorted((os.path.getsize(os.path.join(dst,k+'.json')) for k in files),reverse=True)
print('いちばん大きいファイル %.1f KB'%(sizes[0]/1024))

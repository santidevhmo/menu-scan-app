"""Ordinal position of known apps in iTunes Search results, per query x storefront.

Companion to sweep.py (which finds apps). This one asks: for a query, WHO comes back and WHERE.
ponytail: raw JSON dumped verbatim so every claim in the report is re-checkable.

CAVEAT recorded in the report: itunes.apple.com/search is the *Search API*, not the App Store's
consumer search ranking. Positions here are a public, reproducible relevance proxy -- not ranks.
"""
import json, urllib.parse, urllib.request, time, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "aso-2026-08-30")

QUERIES = {
 "us": ["menu scanner","scan menu","menu calories","menu nutrition","what to order",
        "restaurant calories","eating out calories","healthy eating out","calorie counter",
        "menu translator","allergens menu","high protein restaurant","glp-1 restaurant",
        "scan menu calories","restaurant menu scanner"],
 "mx": ["escanear menu","escanear menú","calorias menu restaurante","calorías menú restaurante",
        "menu calorias","menú calorías","contador de calorias","que pedir en el restaurante",
        "comer fuera saludable","traductor de menus","alergenos menu","menu nutricion",
        "escaner de menu","proteina restaurante","dieta comer fuera"],
 "es": ["escanear menú","calorías menú restaurante","menú calorías","contador de calorías",
        "qué pedir restaurante","comer fuera saludable","traductor de menús","alérgenos menú",
        "menu scanner","escáner de menú"],
}
KNOWN = {6746144481:"MenuFit",6753690910:"Menu Order AI",6771612436:"Forq",
         6760638090:"FoodieFit",6480417616:"Cal AI",410089731:"Carb Manager"}
LIMIT = 50

def fetch(term, c, tries=4):
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": term, "country": c, "entity": "software", "limit": LIMIT})
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(url, timeout=30))["results"]
        except Exception as e:
            if i == tries-1: print("ERR", term, c, e, file=sys.stderr); return []
            time.sleep(2**i)

os.makedirs(OUT, exist_ok=True)
rows, dump = [], {}
for c, qs in QUERIES.items():
    for q in qs:
        res = fetch(q, c)
        dump[f"{c}|{q}"] = [{"pos":i+1,"trackId":a["trackId"],"trackName":a["trackName"],
            "primaryGenreName":a.get("primaryGenreName"),"genres":a.get("genres"),
            "sellerName":a.get("sellerName"),"userRatingCount":a.get("userRatingCount"),
            "averageUserRating":a.get("averageUserRating"),
            "currentVersionReleaseDate":str(a.get("currentVersionReleaseDate"))[:10]}
            for i,a in enumerate(res)]
        hits = {KNOWN[a["trackId"]]: i+1 for i,a in enumerate(res) if a["trackId"] in KNOWN}
        rows.append({"country":c,"query":q,"n_results":len(res),"known_hits":hits,
                     "top5":[(i+1,a["trackName"][:38],a.get("primaryGenreName")) for i,a in enumerate(res[:5])]})
        print(f"{c} {q!r:40} n={len(res):>2}  {hits}")
        time.sleep(0.7)

json.dump(dump, open(f"{OUT}/rank-results.json","w"), indent=1, ensure_ascii=False)
json.dump(rows, open(f"{OUT}/rank-summary.json","w"), indent=1, ensure_ascii=False)
print("\n-> rank-results.json / rank-summary.json")

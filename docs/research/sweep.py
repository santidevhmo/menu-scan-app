"""App Store sweep via the free iTunes Search API. No key, no deps.
ponytail: iOS only -- Google Play has no equivalent free API. Add a Play scrape only if iOS misses something."""
import json, urllib.parse, urllib.request, time, re

KEYWORDS = {
    "direct": ["menu scanner", "scan menu calories", "menu nutrition", "restaurant menu calories",
               "what to order restaurant", "escanear menu", "calorias menu restaurante"],
    "adjacent": ["ai calorie counter", "photo calorie counter", "food scanner calories",
                 "macro scanner", "contador de calorias foto", "escaner de comida"],
    "goalsort": ["restaurant nutrition", "eating out calories", "keto restaurant",
                 "low carb menu", "high protein restaurant", "comer fuera dieta"],
}
COUNTRIES = ["us", "mx"]
# an app is on-topic if its blurb talks about our problem, not just any restaurant/scanner
TOPIC = re.compile(r"calorie|macro|nutrition|protein|carb|keto|diet|nutrici|calor|proteína|dieta", re.I)

def fetch(kw, c, tries=4):
    url = "https://itunes.apple.com/search?" + urllib.parse.urlencode(
        {"term": kw, "country": c, "entity": "software", "limit": 15})
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(url, timeout=25))["results"]
        except Exception as e:
            if i == tries - 1:
                print("ERR", kw, c, e); return []
            time.sleep(2 ** i)

apps = {}
for ring, kws in KEYWORDS.items():
    for kw in kws:
        for c in COUNTRIES:
            for a in fetch(kw, c):
                k = a["trackId"]
                if k not in apps:
                    apps[k] = {"name": a["trackName"], "dev": a.get("sellerName", ""),
                               "rating": a.get("averageUserRating", 0),
                               "reviews": a.get("userRatingCount", 0),
                               "updated": a.get("currentVersionReleaseDate", "")[:10],
                               "price": a.get("formattedPrice", ""),
                               "url": a.get("trackViewUrl", ""),
                               "desc": (a.get("description", "") or "")[:600],
                               "rings": set(), "hits": 0, "kws": set()}
                apps[k]["rings"].add(ring); apps[k]["hits"] += 1; apps[k]["kws"].add(kw)
            time.sleep(0.6)

alive = [a for a in apps.values() if a["updated"] >= "2025-08-30"]
# relevance: matched >1 of our keywords AND actually talks about nutrition
rel = [a for a in alive if a["hits"] > 1 and TOPIC.search(a["name"] + " " + a["desc"])]
rel.sort(key=lambda a: (-a["hits"], -a["reviews"]))

print(f"raw {len(apps)} | alive {len(alive)} | on-topic {len(rel)}\n")
print(f"{'app':42} {'kw':>3} {'reviews':>8} {'rate':>4} {'upd':>10}  rings")
for a in rel[:30]:
    print(f"{a['name'][:41]:42} {a['hits']:>3} {a['reviews']:>8} {a['rating']:>4.1f} "
          f"{a['updated']:>10}  {','.join(sorted(a['rings']))}")

json.dump([{**a, "rings": sorted(a["rings"]), "kws": sorted(a["kws"])} for a in rel],
          open("sweep.json", "w"), indent=1)
print(f"\n-> sweep.json ({len(rel)} apps)")

#!/usr/bin/env python3
"""Probe the Plan API (see docs/plan-api.md). stdlib only.

  INNODIGYM_ENV_FILE=/path/to/env python3 scripts/plan_probe.py <cmd>

cmds:
  list      list ongoing + stopped/ended plans (summary)
  demo      create 2 ZZ-probe custom programs + a 2-week plan (A on Wed/Mon,
            B on Fri, official course mixed in), print the stored shape,
            then delete everything it created
  cleanup   delete every plan, and every custom program whose name starts
            with "ZZ-probe" (only those)
Never prints credentials/token.
"""
import json, sys
from datetime import datetime, date, timedelta
sys.path.insert(0, __import__("os").path.dirname(__file__))
from innodigym_api import Client

c = Client(sys.argv[2] if len(sys.argv) > 2 else None).login()
NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
Q = "curTime=" + NOW.replace(" ", "%20")


def plans():
    out = {}
    for st in ("ongoing", "stopped"):
        for p in c.get(f"/plan/list/{st}?{Q}")[1]["data"] or []:
            out[p["id"]] = (st, p)
    return out


def save_plan(body):
    before = set(plans())
    r = c.post("/plan/save", dict(body, curTime=NOW))[1]
    if not r.get("success"):
        raise SystemExit("plan/save failed: " + str(r.get("msg")))
    return (set(plans()) - before) or None  # save returns data:null, so diff the lists


def delete_plan(pid):
    return c.post("/plan/delete", {"planId": pid, "curTime": NOW})[1]["msg"]


def make_custom(name, action):
    DC = "https://power.renhesports.com/filestore/power/course/COVER_RACK_1_4.jpg"
    kg = float(action["sideWeight"]) if action.get("sideWeight") else 5
    step = {"sort": 1, "actionLibraryId": action["id"], "actionName": action["name"],
            "actionNo": action["actionNo"], "actionType": action["actionType"],
            "picUrl": action["picUrl"], "videoUrl": action["videoUrl"], "stage": 2,
            "count": 12, "consume": action.get("consume"), "sideNum": action.get("sideNum") or 0,
            "countType": action.get("countType") or 1, "sideWeight": round(kg * 10),
            "muscleGroups": action["muscleGroups"], "muscleParts": action["muscleParts"],
            "trainingPoint": action["trainingPoint"], "reqParts": action["reqParts"],
            "restTime": 30, "groupNum": 1, "mode": 0, "modeParam": "{}",
            "breathTip": action["breathTip"], "custom": False, "duration": 12}
    c.post("/course/custom/save", {
        "name": name, "level": 1, "courseType": 1, "smallImg": DC, "detailsImg": DC,
        "deviceCategory": 7, "sportType": 2, "muscleParts": "1", "tags": None, "custom": None,
        "duration": 0, "capacity": 0, "heartRateMin": 0, "heartRateMax": 0, "actionNum": None,
        "collected": False, "description": "", "deviceTypeList": ["35"], "partsList": ["1"],
        "warmUpStepList": [], "mainStepList": [step], "relaxStepList": []})
    for p in c.get("/course/custom/list")[1]["data"]:
        if p["name"] == name:
            return p["id"]


def cleanup():
    for pid in list(plans()):
        print("plan", pid, delete_plan(pid))
    for p in c.get("/course/custom/list")[1]["data"]:
        if p["name"].startswith("ZZ-probe"):
            print("custom", p["id"], c.post(f"/course/custom/delete/{p['id']}")[1]["msg"])


def demo():
    acts = c.get("/action/list")[1]["data"]
    A = make_custom("ZZ-probe Rutina A", acts[0])
    B = make_custom("ZZ-probe Rutina B", acts[1])
    official = c.get("/course/list")[1]["data"][0]["id"]
    # start on the next Monday so preferDays "1,3,5" lines up
    d0 = date.today()
    d0 += timedelta(days=(7 - d0.weekday()) % 7)
    days = [d0 + timedelta(days=k) for k in (0, 2, 4, 7, 9, 11)]  # Mon Wed Fri x2
    names = [d.isoformat() for d in days]
    routine = [A, B, A, A, B, A]
    items = {n: [{"courseId": r}] for n, r in zip(names, routine)}
    items[names[0]].append({"courseId": official})  # mixed custom + official on one day
    new = save_plan({"name": "ZZ-probe demo", "weeks": 2, "preferDays": "1,3,5",
                     "trainDays": ",".join(names), "startDate": names[0], "pic": "",
                     "planItemMap": items})
    pid = next(iter(new))
    p = c.get(f"/plan/get?planId={pid}&{Q}")[1]["data"]
    for d, its in sorted(p["planItemMap"].items()):
        print(d, [(i["courseId"], i["name"], "custom" if i["custom"] else "official", i["duration"]) for i in its])
    print("cleanup:", delete_plan(pid))
    cleanup()


cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
if cmd == "list":
    for pid, (st, p) in plans().items():
        print(pid, st, p["name"], p.get("startDate"), p.get("endDate"))
elif cmd == "demo":
    demo()
elif cmd == "cleanup":
    cleanup()
else:
    sys.exit(__doc__)

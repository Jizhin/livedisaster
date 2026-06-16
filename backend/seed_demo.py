"""
Demo data seeder — run from Render Shell:
    python seed_demo.py

Safe to run multiple times (skips if demo data already exists).
"""
import os, sys, random
from datetime import datetime, timedelta

sys.path.insert(0, "/app")

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set"); sys.exit(1)

engine = create_engine(DATABASE_URL)

# ── Guard: skip if demo data already exists ──────────────────
with Session(engine) as db:
    count = db.execute(text("SELECT COUNT(*) FROM reports WHERE source_type='community'")).scalar()
    if count and count > 10:
        print(f"Demo data already present ({count} reports). Skipping.")
        sys.exit(0)

# ── Helpers ──────────────────────────────────────────────────
def ago(hours=0, days=0, minutes=0):
    return datetime.utcnow() - timedelta(hours=hours, days=days, minutes=minutes)

PICS = [
    "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=700",  # flooded road
    "https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=700",  # rain
    "https://images.unsplash.com/photo-1583245177184-4ab53f5f8a0b?w=700",  # landslide
    "https://images.unsplash.com/photo-1601134467661-3d775b999c18?w=700",  # flood
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700",  # storm
    "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?w=700",  # damaged road
    "https://picsum.photos/seed/kl1/700/450",
    "https://picsum.photos/seed/kl3/700/450",
    "https://picsum.photos/seed/kl5/700/450",
    "https://picsum.photos/seed/kl7/700/450",
    "https://picsum.photos/seed/kl9/700/450",
    "https://picsum.photos/seed/kl11/700/450",
]

REPORTS = [
    # ── Ernakulam ────────────────────────────────────────────
    {
        "slug": "ernakulam", "reporter": "Arun Krishnan",
        "content": "മഴ ശക്തമായി പെയ്യുന്നു. Kakkanad IT Park-ന് മുന്നിൽ വെള്ളം കയറി, വഴി ബ്ലോക്കാണ്.",
        "locality": "Kakkanad", "lat": 10.0159, "lon": 76.3419,
        "status": "active", "created": ago(hours=2),
        "imgs": [PICS[0], PICS[3]], "confirms": 9, "incorrects": 1, "resolves": 0,
        "comments": [
            ("Riya Jose", "ഞാനും ഇതുവഴി വന്നു, ശരിക്കും ബ്ലോക്കുണ്ട്"),
            ("Thomas P", "Police വന്നിട്ടുണ്ട്, alternative route ഉപയോഗിക്കൂ"),
        ]
    },
    {
        "slug": "ernakulam", "reporter": "Meera Nair",
        "content": "Edapally junction-ൽ current ഇല്ല. രണ്ട് മണിക്കൂറായി KSEB-നോട് call ചെയ്തു reply ഇല്ല.",
        "locality": "Edapally", "lat": 10.0261, "lon": 76.3083,
        "status": "active", "created": ago(hours=5),
        "imgs": [], "confirms": 12, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Suresh M", "Same issue here in Vytilla also"),
            ("Divya K", "KSEB helpline 1912 try cheyyu"),
            ("Anoop R", "Current vannu, thanks for reporting"),
        ]
    },
    {
        "slug": "ernakulam", "reporter": "Jithin C",
        "content": "[SAFE NOW] MG Road traffic cleared. Earlier flooding fully resolved after pumping.",
        "locality": "MG Road", "lat": 9.9816, "lon": 76.2999,
        "status": "resolved", "created": ago(hours=14),
        "imgs": [PICS[6]], "confirms": 5, "incorrects": 0, "resolves": 7,
        "comments": [
            ("Priya S", "Good to hear, was worried about commute"),
        ]
    },
    # ── Thiruvananthapuram ───────────────────────────────────
    {
        "slug": "thiruvananthapuram", "reporter": "Sreekanth R",
        "content": "Kowdiar-ൽ വലിയ മരം വീണു. Road ബ്ലോക്കാണ്, വണ്ടി കടക്കില്ല. Corporation-നോട് report ചെയ്തു.",
        "locality": "Kowdiar", "lat": 8.5241, "lon": 76.9366,
        "status": "active", "created": ago(hours=3),
        "imgs": [PICS[5]], "confirms": 15, "incorrects": 0, "resolves": 1,
        "comments": [
            ("Anitha M", "Ente veedu ithinu akathe aanu, valare beshamu"),
            ("Fire Dept", "Team dispatched, will clear in 2 hours"),
        ]
    },
    {
        "slug": "thiruvananthapuram", "reporter": "Lakshmi P",
        "content": "Vattiyoorkavu area-ൽ മഴ വെള്ളം കൂടുതലായി. കുഴി ഉണ്ട് road-ൽ, bike-കൾ വീഴുന്നു.",
        "locality": "Vattiyoorkavu", "lat": 8.5705, "lon": 76.9676,
        "status": "active", "created": ago(hours=8),
        "imgs": [PICS[5]], "confirms": 7, "incorrects": 2, "resolves": 0,
        "comments": [
            ("Rahul K", "Enne bike veenu ille, careful"),
        ]
    },
    {
        "slug": "thiruvananthapuram", "reporter": "Vishnu Das",
        "content": "Peroorkada road-ൽ current ഇല്ല. Morning 6 മുതൽ ഇതുവരെ. Hospital nearby unda, urgent.",
        "locality": "Peroorkada", "lat": 8.5467, "lon": 76.9419,
        "status": "active", "created": ago(hours=6),
        "imgs": [], "confirms": 20, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Dr. Anoop", "Hospital generator on, no issue here"),
            ("KSEB Staff", "Working on it, transformer issue"),
        ]
    },
    # ── Thrissur ─────────────────────────────────────────────
    {
        "slug": "thrissur", "reporter": "Biju Thomas",
        "content": "Chalakudy river water level rising fast. Nearby houses getting waterlogged. Evacuate low-lying areas.",
        "locality": "Chalakudy", "lat": 10.3004, "lon": 76.3311,
        "status": "active", "created": ago(hours=1),
        "imgs": [PICS[3], PICS[0]], "confirms": 22, "incorrects": 0, "resolves": 0,
        "comments": [
            ("District Collector", "Evacuation camp opened at Govt School"),
            ("Jose P", "Family moved to relief camp, stay safe everyone"),
            ("Renu M", "River bund holding but keep watching"),
        ]
    },
    {
        "slug": "thrissur", "reporter": "Sindhu K",
        "content": "Round North-ൽ ഇന്ന് രാത്രി current ഇല്ല. KSEB-നോട് call ചെയ്തു, transformer problem ആണെന്ന് പറഞ്ഞു.",
        "locality": "Round North", "lat": 10.5276, "lon": 76.2144,
        "status": "active", "created": ago(hours=4),
        "imgs": [], "confirms": 6, "incorrects": 1, "resolves": 0,
        "comments": [
            ("Manu T", "Same in Round South also"),
        ]
    },
    # ── Kozhikode ────────────────────────────────────────────
    {
        "slug": "kozhikode", "reporter": "Faisal K",
        "content": "Calicut beach road-ൽ വെള്ളം കയറി. High tide കൂടി sea water road-ലേക്ക് വന്നു. ശ്രദ്ധിക്കുക.",
        "locality": "Beach Road", "lat": 11.2588, "lon": 75.7804,
        "status": "active", "created": ago(hours=3),
        "imgs": [PICS[3]], "confirms": 18, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Hameed A", "Yes very dangerous, avoid beach road tonight"),
            ("Renjith N", "Police blocking entry, good decision"),
        ]
    },
    {
        "slug": "kozhikode", "reporter": "Nisha M",
        "content": "Mavoor road-ൽ ഉരുൾ പൊട്ടൽ. ഒരു ഭാഗം road wash ആയി. ഉടൻ repair ആവശ്യം.",
        "locality": "Mavoor", "lat": 11.2308, "lon": 75.8553,
        "status": "active", "created": ago(days=1),
        "imgs": [PICS[2]], "confirms": 11, "incorrects": 1, "resolves": 0,
        "comments": [
            ("PWD Officer", "Inspection done, repair starts tomorrow"),
        ]
    },
    # ── Palakkad ─────────────────────────────────────────────
    {
        "slug": "palakkad", "reporter": "Suresh Menon",
        "content": "Malampuzha dam water release warning issued. Downstream villages please move to higher ground immediately.",
        "locality": "Malampuzha", "lat": 10.7867, "lon": 76.7085,
        "status": "active", "created": ago(hours=2),
        "imgs": [PICS[4]], "confirms": 35, "incorrects": 0, "resolves": 0,
        "comments": [
            ("District Alert", "Official warning issued. Evacuation in progress."),
            ("Sreejith K", "Family moved to school relief camp"),
            ("Anand P", "Police going house to house asking to evacuate"),
        ]
    },
    {
        "slug": "palakkad", "reporter": "Rekha V",
        "content": "Palakkad town-ൽ heavy rain. NH 544-ൽ വെള്ളം കയറി truck stuck. Traffic jam 2km.",
        "locality": "Palakkad Town", "lat": 10.7867, "lon": 76.6548,
        "status": "active", "created": ago(hours=6),
        "imgs": [PICS[0]], "confirms": 8, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Vinod T", "Avoiding this route, taking bypass"),
        ]
    },
    # ── Wayanad ──────────────────────────────────────────────
    {
        "slug": "wayanad", "reporter": "Rajesh P",
        "content": "Kalpetta-Mananthavady road-ൽ landslide. Road completely blocked. Buses and vehicles stuck.",
        "locality": "Kalpetta", "lat": 11.6085, "lon": 76.0827,
        "status": "active", "created": ago(hours=4),
        "imgs": [PICS[2], PICS[5]], "confirms": 28, "incorrects": 0, "resolves": 2,
        "comments": [
            ("Bus Driver", "Stuck here for 3 hours, please send help"),
            ("Rajan K", "Army unit on the way from Kalpetta"),
            ("Neelima P", "Alternate route via Sulthan Bathery is open"),
        ]
    },
    {
        "slug": "wayanad", "reporter": "Divya M",
        "content": "Mundakkai area-ൽ മഴ ഇപ്പോഴും തുടരുന്നു. ഉരുൾ ഭീഷണി ഉള്ള zone-ൽ residents ആണ്, warn ചെയ്യണം.",
        "locality": "Mundakkai", "lat": 11.5487, "lon": 76.0395,
        "status": "active", "created": ago(hours=1),
        "imgs": [], "confirms": 30, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Revenue Official", "Red alert issued for this area"),
            ("Bindu R", "Please move to relief camp at Chooralmala school"),
        ]
    },
    # ── Idukki ───────────────────────────────────────────────
    {
        "slug": "idukki", "reporter": "Sajan K",
        "content": "Munnar-Adimali road blocked due to landslip near Karadippara. Heavy vehicles cannot pass.",
        "locality": "Karadippara", "lat": 10.0889, "lon": 77.0595,
        "status": "active", "created": ago(hours=5),
        "imgs": [PICS[2]], "confirms": 14, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Tourism Dept", "Tourists advised not to travel to Munnar today"),
        ]
    },
    {
        "slug": "idukki", "reporter": "Asha T",
        "content": "Idukki reservoir shutter opened. Water level critical. Low lying areas near Periyar river on alert.",
        "locality": "Cheruthoni", "lat": 9.8826, "lon": 76.9756,
        "status": "active", "created": ago(hours=3),
        "imgs": [PICS[3]], "confirms": 40, "incorrects": 0, "resolves": 0,
        "comments": [
            ("KSEB Monitor", "Shutter 3 opened at 6AM, flow 2000 cumecs"),
            ("Manju V", "Families near river already evacuated"),
        ]
    },
    # ── Kollam ───────────────────────────────────────────────
    {
        "slug": "kollam", "reporter": "Pradeep R",
        "content": "Ashtamudi lake-ൽ boat service നിർത്തി. കൊടുങ്കാറ്റ് warning ഉള്ളതുകൊണ്ട്. Fishermen please stay shore.",
        "locality": "Kollam Town", "lat": 8.8932, "lon": 76.6141,
        "status": "active", "created": ago(hours=7),
        "imgs": [], "confirms": 16, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Fisheries Dept", "Orange alert for sea. No fishing today."),
        ]
    },
    {
        "slug": "kollam", "reporter": "Sheena V",
        "content": "Kottarakkara-Punalur road-ൽ വലിയ കുഴി. Night drive ചെയ്യുന്നവർ ശ്രദ്ധിക്കണം, accident ആകാൻ chance.",
        "locality": "Kottarakkara", "lat": 9.0025, "lon": 76.7790,
        "status": "active", "created": ago(days=1, hours=3),
        "imgs": [PICS[5]], "confirms": 6, "incorrects": 0, "resolves": 0,
        "comments": [
            ("PWD", "Reported to local office, will attend"),
        ]
    },
    # ── Malappuram ───────────────────────────────────────────
    {
        "slug": "malappuram", "reporter": "Shafeeq A",
        "content": "Tirur-ൽ current ഇല്ല. ഉച്ചതിരിഞ്ഞ് 2 മണി മുതൽ. 5 ward-കളിൽ ആണ്. KSEB ഉടൻ ശ്രദ്ധിക്കണം.",
        "locality": "Tirur", "lat": 10.9127, "lon": 75.9246,
        "status": "active", "created": ago(hours=4),
        "imgs": [], "confirms": 22, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Muhammed N", "Same here in ward 8"),
            ("KSEB Tirur", "Issue identified, team working"),
        ]
    },
    {
        "slug": "malappuram", "reporter": "Fathima B",
        "content": "Manjeri town-ൽ ഇന്ന് രാവിലെ മഴ വെള്ളം bus stand-ൽ കയറി. Buses late ആണ്.",
        "locality": "Manjeri", "lat": 11.1185, "lon": 76.1215,
        "status": "resolved", "created": ago(hours=10),
        "imgs": [PICS[7]], "confirms": 5, "incorrects": 0, "resolves": 6,
        "comments": [
            ("KSRTC", "Service resumed, slight delay expected"),
        ]
    },
    # ── Alappuzha ────────────────────────────────────────────
    {
        "slug": "alappuzha", "reporter": "Benson K",
        "content": "Alleppey backwaters overflowing. Several low-lying houses in Kuttanad already flooded. Boats deployed.",
        "locality": "Kuttanad", "lat": 9.3898, "lon": 76.5386,
        "status": "active", "created": ago(hours=2),
        "imgs": [PICS[3], PICS[0]], "confirms": 45, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Navy", "Naval rescue team on standby at Alleppey"),
            ("Collector", "Relief camps open at 5 locations in Kuttanad"),
            ("Jose M", "Water level 2 feet inside our house"),
            ("Sini T", "Boat rescue for elders ongoing in ward 3"),
        ]
    },
    {
        "slug": "alappuzha", "reporter": "Smitha P",
        "content": "[SAFE NOW] Ambalappuzha area water receded. Roads clear now. Thank you rescue team.",
        "locality": "Ambalappuzha", "lat": 9.3824, "lon": 76.3736,
        "status": "resolved", "created": ago(hours=16),
        "imgs": [PICS[8]], "confirms": 8, "incorrects": 0, "resolves": 12,
        "comments": [
            ("Suresh A", "Great news! Resuming normal life"),
        ]
    },
    # ── Kottayam ─────────────────────────────────────────────
    {
        "slug": "kottayam", "reporter": "Lijo M",
        "content": "Pala-Erattupetta road-ൽ മരം വീണ് traffic block. KSEB wire ഉണ്ടോ എന്ന് check ചെയ്യണം, dangerous.",
        "locality": "Pala", "lat": 9.7044, "lon": 76.6875,
        "status": "active", "created": ago(hours=3),
        "imgs": [PICS[5]], "confirms": 11, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Police PCR", "Unit dispatched"),
            ("Tomy V", "Avoid this route, go via MC Road"),
        ]
    },
    {
        "slug": "kottayam", "reporter": "Jessy A",
        "content": "Meenachil river water level dangerously high at Kottayam town. 1990-ൽ ഉണ്ടായ flood level exceed ചെയ്യാൻ chance.",
        "locality": "Kottayam Town", "lat": 9.5916, "lon": 76.5222,
        "status": "active", "created": ago(hours=1),
        "imgs": [PICS[4]], "confirms": 33, "incorrects": 0, "resolves": 0,
        "comments": [
            ("CWC", "Gauge reading 11.2m, danger mark 10.5m"),
            ("Rani T", "Shifting important documents to upper floor"),
        ]
    },
    # ── Pathanamthitta ───────────────────────────────────────
    {
        "slug": "pathanamthitta", "reporter": "Rajan S",
        "content": "Pampa river flooding Ranni town. Sabarimala pilgrims route blocked. Authorities deployed at Seethathodu.",
        "locality": "Ranni", "lat": 9.3817, "lon": 76.7835,
        "status": "active", "created": ago(hours=4),
        "imgs": [PICS[3]], "confirms": 19, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Devasom Board", "Sabarimala temporarily suspended"),
        ]
    },
    # ── Kannur ───────────────────────────────────────────────
    {
        "slug": "kannur", "reporter": "Vinod K",
        "content": "Kannur town-ൽ heavy rain. Thavakkara ward-ൽ ഇടിമിന്നൽ. ഒരു house-ൽ damage. All safe.",
        "locality": "Thavakkara", "lat": 11.8745, "lon": 75.3704,
        "status": "verified", "created": ago(hours=5),
        "imgs": [PICS[4], PICS[9]], "confirms": 7, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Fire Brigade", "Damage assessed, no structural risk"),
            ("Sabu P", "Family stayed with neighbour, all okay"),
        ]
    },
    {
        "slug": "kannur", "reporter": "Deepa M",
        "content": "Thalassery-Mahe road-ൽ ഇടിമിന്നൽ pole-ൽ hit ചെയ്തു. Current ഇല്ല 3 ward-കളിൽ.",
        "locality": "Thalassery", "lat": 11.7515, "lon": 75.4930,
        "status": "active", "created": ago(hours=6),
        "imgs": [], "confirms": 14, "incorrects": 1, "resolves": 0,
        "comments": [
            ("KSEB Kannur", "Repair team on site, 2 hrs to restore"),
        ]
    },
    # ── Kasaragod ────────────────────────────────────────────
    {
        "slug": "kasaragod", "reporter": "Harish N",
        "content": "Kasaragod town-ൽ ഇന്ന് രാവിലെ ഭൂചലനം feel ചെയ്തോ? Walls cracked in a few houses near Bus stand.",
        "locality": "Kasaragod Town", "lat": 12.4996, "lon": 74.9869,
        "status": "active", "created": ago(hours=8),
        "imgs": [PICS[10]], "confirms": 9, "incorrects": 3, "resolves": 0,
        "comments": [
            ("Seismology Dept", "No earthquake recorded. May be heavy vehicle vibration."),
            ("Naseer P", "I felt it too near Super Market"),
        ]
    },
    # ── Palakkad extra ───────────────────────────────────────
    {
        "slug": "palakkad", "reporter": "Anitha R",
        "content": "Meenkara dam area-ൽ വെള്ളം release ചെയ്തു. Downstream-ൽ ഉള്ളവർ alert ആകണം.",
        "locality": "Meenkara", "lat": 10.5533, "lon": 76.4537,
        "status": "active", "created": ago(hours=2, minutes=30),
        "imgs": [], "confirms": 17, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Irrigation Dept", "Discharge 500 cusecs, controlled release"),
        ]
    },
    # ── Thrissur extra ───────────────────────────────────────
    {
        "slug": "thrissur", "reporter": "Biju V",
        "content": "Guruvayur temple road-ൽ അടഞ്ഞ് കിടക്കുന്ന manhole. Pilgrims many. Accident risk high.",
        "locality": "Guruvayur", "lat": 10.5942, "lon": 76.0417,
        "status": "active", "created": ago(days=1),
        "imgs": [PICS[11]], "confirms": 6, "incorrects": 0, "resolves": 0,
        "comments": [
            ("Municipality", "Repair crew dispatched"),
        ]
    },
]

# ── Insert data ───────────────────────────────────────────────
from app.db.base import Base
import app.models  # noqa — register all models

from app.models.report import Report, ReportImage
from app.models.comment import Comment
from app.models.district import District
from app.models.verification import Verification, VerificationKind

inserted = 0
with Session(engine) as db:
    for r in REPORTS:
        district = db.scalar(select(District).where(District.slug == r["slug"]))
        if not district:
            print(f"  SKIP: district '{r['slug']}' not found")
            continue

        report = Report(
            district_id=district.id,
            reporter_name=r["reporter"],
            content=r["content"],
            locality=r.get("locality"),
            state="Kerala",
            country="India",
            latitude=r.get("lat"),
            longitude=r.get("lon"),
            location_attached=bool(r.get("lat")),
            status=r["status"],
            source_type="community",
            is_approved=True,
            views_count=random.randint(10, 80),
            created_at=r["created"],
            updated_at=r["created"],
        )
        db.add(report)
        db.flush()  # get report.id

        # Images
        for url in r.get("imgs", []):
            db.add(ReportImage(report_id=report.id, file_path=url, created_at=r["created"]))

        # Verifications (confirms)
        for i in range(r.get("confirms", 0)):
            db.add(Verification(
                report_id=report.id,
                kind=VerificationKind.confirm,
                voter_name=f"user{random.randint(100,999)}",
                created_at=r["created"] + timedelta(minutes=i*15)
            ))
        # Incorrects
        for i in range(r.get("incorrects", 0)):
            db.add(Verification(
                report_id=report.id,
                kind=VerificationKind.incorrect,
                voter_name=f"user{random.randint(100,999)}",
                created_at=r["created"] + timedelta(minutes=i*20)
            ))
        # Resolves
        for i in range(r.get("resolves", 0)):
            db.add(Verification(
                report_id=report.id,
                kind=VerificationKind.resolved,
                voter_name=f"user{random.randint(100,999)}",
                created_at=r["created"] + timedelta(minutes=i*25)
            ))

        # Comments
        for author, text in r.get("comments", []):
            db.add(Comment(
                report_id=report.id,
                author_name=author,
                content=text,
                is_approved=True,
                created_at=r["created"] + timedelta(minutes=random.randint(5, 90))
            ))

        inserted += 1

    db.commit()

print(f"\nDone! Inserted {inserted} demo reports across Kerala districts.")
print("Refresh the site to see the data.")

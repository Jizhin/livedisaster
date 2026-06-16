import json
import requests
from time import sleep

KERALA_DISTRICTS = [
    "Thiruvananthapuram",
    "Kollam",
    "Pathanamthitta",
    "Alappuzha",
    "Kottayam",
    "Idukki",
    "Ernakulam",
    "Thrissur",
    "Palakkad",
    "Malappuram",
    "Kozhikode",
    "Wayanad",
    "Kannur",
    "Kasaragod",
]

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def get_district_places(district_name):
    query = f"""
    [out:json][timeout:120];

    area["boundary"="administrative"]
        ["admin_level"="6"]
        ["name"="{district_name}"]->.district;

    (
      node(area.district)["place"~"city|town|village|suburb|hamlet|locality"];
      way(area.district)["place"~"city|town|village|suburb|hamlet|locality"];
      relation(area.district)["place"~"city|town|village|suburb|hamlet|locality"];
    );

    out tags;
    """

    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=180,
    )

    response.raise_for_status()

    data = response.json()

    places = set()

    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")

        if name:
            places.add(name.strip())

    return sorted(places)


def build_kerala_dataset():
    result = {}

    for district in KERALA_DISTRICTS:
        print(f"Fetching {district}...")

        try:
            places = get_district_places(district)

            result[district.lower()] = places

            print(
                f"✓ {district}: {len(places)} places found"
            )

            sleep(2)

        except Exception as e:
            print(f"✗ {district}: {e}")
            result[district.lower()] = []

    with open(
        "kerala_locations.json",
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            result,
            f,
            ensure_ascii=False,
            indent=4
        )

    print("Saved to kerala_locations.json")


if __name__ == "__main__":
    build_kerala_dataset()
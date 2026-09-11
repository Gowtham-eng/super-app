"""Parse helpers for Kissflow Non_Refex_Location_Dataform_A00 (no live call)."""
from routes.itsm import (
    locations_for_entity,
    normalize_non_refex_entity_key,
    normalize_non_refex_location_key,
    parse_non_refex_location_rows,
)


def test_entity_aliases():
    assert normalize_non_refex_entity_key("Extrovis") == "Extrovis"
    assert normalize_non_refex_entity_key("Modepro") == "ModePro"
    assert normalize_non_refex_entity_key("Kavispharma\n") == "Kavis"
    assert normalize_non_refex_entity_key("Pharmapack") == "Pharma Pack"


def test_location_aliases():
    assert normalize_non_refex_location_key("EPL-I") == normalize_non_refex_location_key("EPL1")
    assert normalize_non_refex_location_key("EPL-II") == normalize_non_refex_location_key("EPL2")
    assert normalize_non_refex_location_key("EPL-I") != normalize_non_refex_location_key("EPL-II")


def test_parse_and_filter_payload():
    payload = {
        "Data": [
            {"Entity": "Extrovis", "Location_1": "EPL-I", "_id": "1"},
            {"Entity": "Extrovis", "Location_1": "EPL-II", "_id": "2"},
            {"Entity": "Modepro", "Location_1": "Kurkumbh", "_id": "3"},
            {"Entity": "Modepro", "Location_1": "Andheri", "_id": "4"},
            {"Entity": "Kavispharma\n", "Location_1": "Sugarland", "_id": "5"},
            {"Entity": "Kavispharma\n", "Location_1": "Kipway", "_id": "6"},
            {"Entity": "Pharmapack", "Location_1": "Hungary", "_id": "7"},
            {"Entity": "Extrovis", "Location_1": "EPL-I", "_id": "dup"},
        ]
    }
    rows = parse_non_refex_location_rows(payload)
    extrovis = locations_for_entity(rows, "Extrovis")
    assert [row["location"] for row in extrovis] == ["EPL-I", "EPL-II"]
    modepro = locations_for_entity(rows, "ModePro")
    assert [row["location"] for row in modepro] == ["Kurkumbh", "Andheri"]
    kavis = locations_for_entity(rows, "Kavis")
    assert [row["location"] for row in kavis] == ["Sugarland", "Kipway"]
    pharma = locations_for_entity(rows, "Pharma Pack")
    assert [row["location"] for row in pharma] == ["Hungary"]

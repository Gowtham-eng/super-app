"""Non-Refex Help Desk comment channel + attachment parsing (no live Kissflow)."""
from routes.itsm import (
    _attachment_key_is_image,
    _build_kissflow_upload_object_path,
    _collect_multipart_files,
    _employee_visible_comments,
    _is_comment_nested_table_step,
    _is_gcs_signed_url,
    _kissflow_headers,
    _merge_comment_lists,
    _normalize_comment_channel,
    _parse_agent_solutions,
    _parse_comment_attachments,
    _parse_report_ticket,
    _ticket_webhook_body,
    _uses_extrovis_flow,
    REPORT_FIELD_IDS,
)


def test_extrovis_flow_gate():
    assert _uses_extrovis_flow("Extrovis") is True
    assert _uses_extrovis_flow("ModePro") is True
    assert _uses_extrovis_flow("Refex") is False


def test_comment_channel_aliases():
    assert _normalize_comment_channel("External") == "External"
    assert _normalize_comment_channel("internal") == "External"
    assert _normalize_comment_channel("User Comments") == "User"
    assert _normalize_comment_channel("") == ""


def test_help_desk_shows_user_comments_only():
    rows = [
        {"comment": "agent note", "commentsType": "External"},
        {"comment": "employee note", "commentsType": "User"},
        {"comment": "user comments alias", "commentsType": "User Comments"},
        {"comment": "employee alias", "commentsType": "Employee"},
        {"comment": "old note", "commentsType": ""},
        {"comment": "internal note", "commentsType": "Internal"},
    ]
    visible = _employee_visible_comments(rows, "Extrovis")
    texts = [row["comment"] for row in visible]
    assert texts == ["employee note", "user comments alias", "employee alias"]
    assert [row["comment"] for row in _employee_visible_comments(rows, "Refex")] == [
        "agent note",
        "employee note",
        "user comments alias",
        "employee alias",
        "old note",
        "internal note",
    ]


def test_keeps_all_user_comments_when_attachment_table_is_shorter():
    field_ids = REPORT_FIELD_IDS["extrovis"]
    data = {
        "Column_qr_9gP_vE5": [
            {"Name_1": "Vishnu", "Resolution": "hi how r u", "Comments_2": "User"},
            {"Name_1": "Aasik", "Resolution": "ya fine", "Comments_2": "User Comments"},
            {"Name_1": "Aasik", "Resolution": "i have attached the screenshot", "Comments_2": "User"},
            {"Name_1": "Agent", "Resolution": "internal only", "Comments_2": "Internal"},
        ],
        "Table::IT__Agent_Solution": {
            "0": {
                "_id": "IT__Agent_Solution_aaaaaaaaaa",
                "Name_1": "Aasik",
                "Resolution": "i have attached the screenshot",
                "Comments_2": "User",
                "Attachments": [{"id": "Attach_1", "name": "shot.png", "key": "k1"}],
            }
        },
    }
    parsed = _parse_agent_solutions(data, field_ids, requester_name="Aasik")
    visible = _employee_visible_comments(parsed, "Extrovis")
    texts = [row["comment"] for row in visible]
    assert texts == [
        "hi how r u",
        "ya fine",
        "i have attached the screenshot",
    ]
    attached = next(row for row in visible if "attached" in row["comment"])
    assert attached["id"] == "IT__Agent_Solution_aaaaaaaaaa"
    assert attached["attachments"][0]["name"] == "shot.png"
    assert all(_normalize_comment_channel(row["commentsType"]) == "User" for row in visible)


def test_numeric_nested_table_keeps_attachments():
    field_ids = REPORT_FIELD_IDS["extrovis"]
    data = {
        "Column_qr_9gP_vE5": [
            {"Name_1": "Aasik", "Resolution": "i have attached the screenshot", "Comments_2": "User"},
        ],
        "Table::IT__Agent_Solution": {
            "0": {
                "_id": "IT__Agent_Solution_aaaaaaaaaa",
                "Name_1": "Aasik",
                "Resolution": "i have attached the screenshot",
                "Comments_2": "User",
                "Attachments": [{"id": "Attach_1", "name": "shot.png", "key": "k1"}],
            }
        },
    }
    parsed = _parse_agent_solutions(data, field_ids, requester_name="Aasik")
    assert len(parsed) == 1
    assert parsed[0]["id"] == "IT__Agent_Solution_aaaaaaaaaa"
    assert parsed[0]["attachments"][0]["name"] == "shot.png"


def test_merge_keeps_files_when_refresh_returns_text_only():
    text_only = {
        "id": "solution-8",
        "comment": "i have attached the screesnhot for your reference",
        "attachments": [],
    }
    with_files = {
        "id": "IT__Agent_Solution_aaaaaaaaaa",
        "comment": "i have attached the screesnhot for your reference",
        "attachments": [{"name": "shot.png", "key": "k1"}],
    }
    merged = _merge_comment_lists([text_only], [with_files])
    assert len(merged) == 1
    assert merged[0]["attachments"][0]["name"] == "shot.png"
    field_ids = REPORT_FIELD_IDS["extrovis"]
    data = {
        "Table::IT__Agent_Solution": [
            {
                "_id": "IT__Agent_Solution_aaaaaaaaaa",
                "Name_1": "Aasik",
                "Resolution": "",
                "Comments_2": "User",
                "Attachments": [{"id": "Attach_1", "name": "shot.png", "key": "k1"}],
            }
        ]
    }
    parsed = _parse_agent_solutions(data, field_ids, requester_name="Aasik")
    assert len(parsed) == 1
    assert parsed[0]["comment"] == ""
    assert parsed[0]["commentsType"] == "User"
    assert parsed[0]["attachments"][0]["name"] == "shot.png"


def test_parse_keeps_attachment_only_rows():
    field_ids = REPORT_FIELD_IDS["extrovis"]
    data = {
        "Table::IT__Agent_Solution": [
            {
                "_id": "IT__Agent_Solution_aaaaaaaaaa",
                "Name_1": "Aasik",
                "Resolution": "",
                "Comments_2": "User",
                "Attachments": [{"id": "Attach_1", "name": "shot.png", "key": "k1"}],
            }
        ]
    }
    parsed = _parse_agent_solutions(data, field_ids, requester_name="Aasik")
    assert len(parsed) == 1
    assert parsed[0]["comment"] == ""
    assert parsed[0]["commentsType"] == "User"
    assert parsed[0]["attachments"][0]["name"] == "shot.png"


def test_attachment_unwrap():
    files = _parse_comment_attachments(
        {"Attachments": {"Data": [{"name": "a.pdf", "id": "Attach_x"}]}}
    )
    assert files[0]["name"] == "a.pdf"


def test_attachment_column_id_scan():
    files = _parse_comment_attachments(
        {
            "Column_zXMX1EDrCx": {
                "id": "Attach_9",
                "name": "error.png",
                "key": "Live_IT_Service_Request_Extrovis_A00/PkX/error.png",
                "mimeType": "image/png",
                "photos": [{"size": "100x100", "key": "Live_IT_Service_Request_Extrovis_A00/PkX/photos/100x100.png"}],
            }
        }
    )
    assert len(files) == 1
    assert files[0]["name"] == "error.png"
    assert files[0]["key"].endswith("error.png")
    assert files[0]["mimeType"] == "image/png"
    assert files[0]["photos"][0]["key"].endswith("100x100.png")


def test_attachment_single_object():
    files = _parse_comment_attachments(
        {
            "Attachments": {
                "id": "Attach_1",
                "name": "shot.png",
                "key": "process/Pk/shot.png",
                "photos": [{"size": "100x100", "key": "process/Pk/photos/100x100.png"}],
            }
        }
    )
    assert len(files) == 1
    assert files[0]["name"] == "shot.png"
    assert files[0]["key"].endswith("shot.png")


def test_collect_multipart_files_single_or_list():
    class _Up:
        def __init__(self, name):
            self.filename = name

    class _Form(dict):
        def getlist(self, name):
            value = self.get(name)
            if value is None:
                return []
            return value if isinstance(value, list) else [value]

    one = _Up("shot.png")
    assert [item.filename for item in _collect_multipart_files(_Form(files=one))] == ["shot.png"]
    two = [_Up("a.png"), _Up("b.pdf")]
    assert [item.filename for item in _collect_multipart_files(_Form(files=two))] == ["a.png", "b.pdf"]
    assert _collect_multipart_files(_Form()) == []


def test_kissflow_headers_include_key_id_and_secret():
    cfg = {
        "access_key_id": "Ak-report",
        "access_key_secret": "secret-report",
        "bot_access_key_id": "Ak-bot",
        "bot_access_key_secret": "secret-bot",
    }
    get_headers = _kissflow_headers(cfg, json_body=False)
    assert get_headers["X-Access-Key-Id"] == "Ak-report"
    assert get_headers["X-Access-Key-Secret"] == "secret-report"
    assert "Content-Type" not in get_headers
    write_headers = _kissflow_headers(cfg, for_write=True, json_body=True)
    assert write_headers["X-Access-Key-Id"] == "Ak-bot"
    assert write_headers["X-Access-Key-Secret"] == "secret-bot"
    assert write_headers["Content-Type"] == "application/json"
    key = "Live_IT_Service_Request_Extrovis_A00/PkX/PkY/IT__Agent_Solution/IT__Agent_Solution_aaaaaaaaaa/Attach_1/shot.png"
    thumb = _build_kissflow_upload_object_path("AcCMptp3yqcn", key, True)
    assert thumb.startswith("/upload/2/AcCMptp3yqcn/Live_IT_Service_Request_Extrovis_A00/")
    assert thumb.endswith("/Attach_1/photos/100x100.png")
    assert "?key=" not in thumb
    assert "/file/2/" not in thumb
    assert _is_gcs_signed_url(
        "https://storage.googleapis.com/aries-cs-doc-p001/x.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc"
    )
    txt = "Live_IT_Service_Request_Extrovis_A00/PkX/PkY/IT__Agent_Solution/IT__Agent_Solution_aaaaaaaaaa/Attach_1/My_Task_Data.txt"
    txt_path = _build_kissflow_upload_object_path("AcCMptp3yqcn", txt, True)
    assert txt_path.endswith("/Attach_1/My_Task_Data.txt")
    assert "/photos/" not in txt_path
    pdf = "Live_IT_Service_Request_Extrovis_A00/PkX/PkY/IT__Agent_Solution/IT__Agent_Solution_aaaaaaaaaa/Attach_1/policy.pdf"
    assert _build_kissflow_upload_object_path("AcCMptp3yqcn", pdf, True).endswith("/Attach_1/policy.pdf")
    zip_key = "Live_IT_Service_Request_Extrovis_A00/PkX/PkY/IT__Agent_Solution/IT__Agent_Solution_aaaaaaaaaa/Attach_1/matrix.zip"
    assert _build_kissflow_upload_object_path("AcCMptp3yqcn", zip_key, True).endswith("/Attach_1/matrix.zip")
    assert _attachment_key_is_image(key) is True
    assert _attachment_key_is_image(txt) is False
    assert _attachment_key_is_image(pdf) is False


def test_merge_prefers_attachments_and_keeps_file_only_rows():
    text_only = {"id": "IT__Agent_Solution_aaaaaaaaaa", "comment": "Test", "attachments": []}
    with_files = {
        "id": "IT__Agent_Solution_aaaaaaaaaa",
        "comment": "Test",
        "attachments": [{"name": "shot.png", "key": "k1"}],
    }
    merged = _merge_comment_lists([text_only], [with_files])
    assert len(merged) == 1
    assert merged[0]["attachments"][0]["name"] == "shot.png"
    file_only = {
        "id": "IT__Agent_Solution_bbbbbbbbbb",
        "comment": "",
        "attachments": [{"name": "doc.pdf", "key": "k2"}],
    }
    kept = _merge_comment_lists([file_only])
    assert len(kept) == 1
    assert kept[0]["attachments"][0]["name"] == "doc.pdf"


def test_non_refex_webhook_includes_subject():
    body = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_Extrovis_A00",
        name="Test Automate",
        email="test.automate@extrovis.com",
        entity="Extrovis",
        location="EPL-I",
        sub_type="Access to Printer B/W",
        criticality="Low",
        description="test",
        subject="Laptop is not working",
    )
    assert list(body.keys()) == [
        "process_id",
        "Source",
        "Name",
        "Email",
        "Entity",
        "Location_user",
        "Subject",
        "Sub_Type",
        "Criticality",
        "Description",
    ]
    assert body["Subject"] == "Laptop is not working"
    assert body["Source"] == "Mobile"
    refex = _ticket_webhook_body(
        process_id="Live_IT_Service_Request_A00",
        name="A",
        email="a@refex.com",
        entity="Refex",
        location="Chennai",
        sub_type="VPN",
        criticality="Low",
        description="down",
        subject="ignored",
    )
    assert "Subject" not in refex


def test_extrovis_report_ticket_includes_subject():
    parsed = _parse_report_ticket(
        {
            "Column_HEiwMtIBBO": "Laptop is not working",
            "Column_AS7UbLz7Mg": "screen flicker",
            "_id": "PkSubjectRow",
        },
        [],
        0,
        "Extrovis",
    )
    assert parsed["subject"] == "Laptop is not working"
    assert parsed["description"] == "screen flicker"
    refex = _parse_report_ticket(
        {"Description": "vpn down", "Subject": "ignored"},
        [],
        0,
        "Refex",
    )
    assert refex.get("subject", "") == ""


def test_comment_nested_table_prefers_solution_not_pickup():
    assert _is_comment_nested_table_step("IT Agent Solution") is True
    assert _is_comment_nested_table_step("IT Tech Support") is True
    assert _is_comment_nested_table_step("IT Agent PickUp") is False
    assert _is_comment_nested_table_step("PickUp") is False

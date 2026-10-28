from services.itsm_comment_mail import (
    REFEXONE_LOGO_URL,
    SUPPORT_TO,
    assigned_greeting_name,
    build_comment_mail_html,
    build_employee_comment_mail_payload,
    comment_mail_subject,
    resolve_comment_mail_identity,
)


def test_subject_uses_request_id():
    assert comment_mail_subject("EXT-1042") == "Tech Help Desk - New Comment Added | Ticket EXT-1042"
    assert comment_mail_subject("") == "Tech Help Desk - New Comment Added | Ticket Ticket"


def test_employee_payload_goes_to_support_list():
    payload = build_employee_comment_mail_payload(
        request_id="EXT-1042",
        author_name="Aasik",
        comment="Please check this",
        assigned_to="Vishnu Kumar",
    )
    assert payload["to"] == SUPPORT_TO
    assert payload["cc"] == ["itsupport@extrovis.com"]
    assert payload["from"] == "itsupport@extrovis.com"
    assert "EXT-1042" in payload["subject"]
    assert "Please check this" in payload["html"]
    assert "Dear<strong" in payload["html"]
    assert "Vishnu" in payload["html"]
    assert "Dear IT Support" not in payload["html"]


def test_assigned_greeting_uses_human_not_approle():
    assert assigned_greeting_name("Vishnu (user)") == "Vishnu"
    assert assigned_greeting_name([{"Kind": "AppRole", "Name": "IT Agents Extrovis"}]) == "IT Support"
    assert assigned_greeting_name(
        [{"Kind": "AppRole", "Name": "IT Agents Extrovis"}, {"Kind": "User", "Name": "Vishnu"}],
    ) == "Vishnu"
    assert assigned_greeting_name("Vishnu Kumar (user), IT Agents Extrovis (role)") == "Vishnu"


def test_from_cc_and_to_follow_entity():
    extrovis = resolve_comment_mail_identity("Extrovis")
    assert extrovis["from"] == "itsupport@extrovis.com"
    assert extrovis["cc"] == ["itsupport@extrovis.com"]
    pharma = build_employee_comment_mail_payload(
        request_id="PP-1",
        author_name="Aasik",
        comment="note",
        entity="Pharmapack",
        commenter_email="user@pharmapack.com",
        requester_email="user@pharmapack.com",
    )
    assert pharma["to"] == SUPPORT_TO
    assert pharma["from"] == "itsupport@extrovis.com"
    assert pharma["cc"] == ["itsupport@extrovis.com"]
    kavis = build_employee_comment_mail_payload(
        request_id="KV-1",
        author_name="Aasik",
        comment="note",
        entity="KavisPharma",
        commenter_email="user@kavispharma.com",
        requester_email="user@kavispharma.com",
    )
    assert kavis["to"] == ["Jon.Hudanich@kavispharma.com", "Vidhya.Kumar@kavispharma.com"]
    assert "itsupport@extrovis.com" not in kavis["to"]
    assert kavis["from"] == "itsupport@kavispharma.com"
    assert kavis["cc"] == [
        "Jon.Hudanich@kavispharma.com",
        "Vidhya.Kumar@kavispharma.com",
    ]
    modepro = build_employee_comment_mail_payload(
        request_id="MP-1",
        author_name="Aasik",
        comment="note",
        entity="Mode Pro",
        commenter_email="user@modepro.com",
        requester_email="user@modepro.com",
    )
    assert modepro["to"] == ["pradip.kakade@modepro.com"]
    assert "itsupport@extrovis.com" not in modepro["to"]
    assert modepro["from"] == "itsupport@modepro.com"
    assert modepro["cc"] == ["pradip.kakade@modepro.com"]
    agent = build_employee_comment_mail_payload(
        request_id="MP-2",
        author_name="Pradip",
        comment="note",
        entity="ModePro",
        commenter_email="pradip.kakade@modepro.com",
        requester_email="user@modepro.com",
    )
    assert agent["to"] == ["user@modepro.com"]
    assert agent["cc"] == ["pradip.kakade@modepro.com"]
    missing = build_employee_comment_mail_payload(
        request_id="MP-3",
        author_name="Pradip",
        comment="note",
        entity="ModePro",
        commenter_email="pradip.kakade@modepro.com",
        requester_email="",
    )
    assert missing["to"] == ["pradip.kakade@modepro.com"]
    blank = build_employee_comment_mail_payload(
        request_id="X-1",
        author_name="Aasik",
        comment="note",
        entity="",
    )
    assert blank["to"] == SUPPORT_TO
    assert blank["from"] == "itsupport@extrovis.com"
    sap_agent = build_employee_comment_mail_payload(
        request_id="SAP-1",
        author_name="Kishore",
        comment="note",
        entity="KavisPharma",
        commenter_email="kishore.yepuri@extrovis.com",
        requester_email="employee@kavispharma.com",
        requester_name="Priya Shah",
        assigned_to="Kishore Yepuri",
        sap=True,
    )
    assert sap_agent["from"] == "itsupport@kavispharma.com"
    assert "replyTo" not in sap_agent
    assert sap_agent["to"] == ["employee@kavispharma.com"]
    assert sap_agent["cc"] == [
        "kishore.yepuri@extrovis.com",
        "Sarwar.Syed@nttdata.com",
        "Chandana.Metikala@nttdata.com",
    ]
    assert "> Priya<" in sap_agent["html"]
    sap_user = build_employee_comment_mail_payload(
        request_id="SAP-2",
        author_name="Employee",
        comment="note",
        entity="ModePro",
        commenter_email="user@modepro.com",
        requester_email="user@modepro.com",
        assigned_to="Pradip Kakade",
        sap={"Name": "Yes"},
    )
    assert sap_user["from"] == "itsupport@modepro.com"
    assert sap_user["replyTo"] == sap_user["to"]
    assert sap_user["to"] == ["pradip.kakade@modepro.com"]
    assert sap_user["cc"] == [
        "kishore.yepuri@extrovis.com",
        "Sarwar.Syed@nttdata.com",
        "Chandana.Metikala@nttdata.com",
    ]
    assert "> Pradip<" in sap_user["html"]
    assert "itsupport@extrovis.com" not in sap_user["to"]
    assert "replyTo" not in modepro
    named = build_employee_comment_mail_payload(
        request_id="SAP-3",
        author_name="Employee",
        comment="note",
        entity="Extrovis",
        commenter_email="user@extrovis.com",
        requester_email="user@extrovis.com",
        assigned_to="Vishnu Gullapally",
        sap=True,
    )
    assert named["to"] == ["Vishnu.Gullapally@extrovis.com"]
    assert named["from"] == "itsupport@extrovis.com"
    assert named["replyTo"] == named["to"]
    assert "> Vishnu<" in named["html"]
    last_first = build_employee_comment_mail_payload(
        request_id="SAP-4",
        author_name="Employee",
        comment="note",
        entity="Extrovis",
        commenter_email="user@extrovis.com",
        requester_email="user@extrovis.com",
        assigned_to="Villa, Tanuja",
        sap=True,
    )
    assert last_first["to"] == ["Tanuja.Villa@bs.nttdata.com"]
    module_only = build_employee_comment_mail_payload(
        request_id="SAP-5",
        author_name="Employee",
        comment="note",
        entity="Extrovis",
        commenter_email="user@extrovis.com",
        requester_email="user@extrovis.com",
        assigned_to="Waiting for Pickup",
        sap_module="SD",
        sap=True,
    )
    assert module_only["to"] == ["Tanuja.Villa@bs.nttdata.com", "Anusha.Shyamala@bs.nttdata.com"]
    assert module_only["replyTo"] == module_only["to"]
    assert "itsupport@extrovis.com" not in sap_user["cc"]
    assert blank["cc"] == ["itsupport@extrovis.com"]


def test_html_escapes_comment_text():
    html_body = build_comment_mail_html(
        request_id="EXT-1",
        author_name="Vishnu",
        comment="<script>alert(1)</script>",
        attachment_count=1,
    )
    assert "<script>" not in html_body
    assert "&lt;script&gt;" in html_body
    assert "1 attachment" in html_body
    assert REFEXONE_LOGO_URL in html_body
    assert "#315E89" in html_body
    assert "#EEF4FA" in html_body
    assert "Ticket Details" in html_body
    assert "Ticket Type" not in html_body
    assert ">Category<" not in html_body
    assert "Latest Comment" in html_body
    assert "#222831" in html_body

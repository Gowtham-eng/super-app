from services.itsm_comment_mail import (
    REFEXONE_LOGO_URL,
    SUPPORT_CC,
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


def test_from_and_cc_follow_entity_to_stays_support():
    extrovis = resolve_comment_mail_identity("Extrovis")
    assert extrovis["from"] == "itsupport@extrovis.com"
    assert extrovis["cc"] == ["itsupport@extrovis.com"]
    pharma = build_employee_comment_mail_payload(
        request_id="PP-1",
        author_name="Aasik",
        comment="note",
        entity="Pharmapack",
    )
    assert pharma["to"] == SUPPORT_TO
    assert pharma["from"] == "itsupport@extrovis.com"
    assert pharma["cc"] == ["itsupport@extrovis.com"]
    kavis = build_employee_comment_mail_payload(
        request_id="KV-1",
        author_name="Aasik",
        comment="note",
        entity="KavisPharma",
    )
    assert kavis["to"] == SUPPORT_TO
    assert kavis["from"] == "itsupport@kavispharma.com"
    assert kavis["cc"] == ["Jon.Hudanich@kavispharma.com", "Vidhya.Kumar@kavispharma.com"]
    modepro = build_employee_comment_mail_payload(
        request_id="MP-1",
        author_name="Aasik",
        comment="note",
        entity="Mode Pro",
    )
    assert modepro["to"] == SUPPORT_TO
    assert modepro["from"] == "itsupport@modepro.com"
    assert modepro["cc"] == ["pradip.kakade@modepro.com"]
    blank = build_employee_comment_mail_payload(
        request_id="X-1",
        author_name="Aasik",
        comment="note",
        entity="",
    )
    assert blank["to"] == SUPPORT_TO
    assert blank["from"] == "itsupport@extrovis.com"
    assert blank["cc"] == ["itsupport@extrovis.com"]
    assert SUPPORT_CC == ["mohamedaasik.m@refex.co.in"]


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

from services.itsm_comment_mail import (
    REFEXONE_LOGO_URL,
    SUPPORT_CC,
    SUPPORT_TO,
    build_comment_mail_html,
    build_employee_comment_mail_payload,
    comment_mail_subject,
)


def test_subject_uses_request_id():
    assert comment_mail_subject("EXT-1042") == "Tech Help Desk - New Comment Added | Ticket EXT-1042"
    assert comment_mail_subject("") == "Tech Help Desk - New Comment Added | Ticket Ticket"


def test_employee_payload_goes_to_support_list():
    payload = build_employee_comment_mail_payload(
        request_id="EXT-1042",
        author_name="Aasik",
        comment="Please check this",
    )
    assert payload["to"] == SUPPORT_TO
    assert payload["cc"] == SUPPORT_CC
    assert payload["from"] == "itsupport@extrovis.com"
    assert "EXT-1042" in payload["subject"]
    assert "Please check this" in payload["html"]


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
    assert "Latest Comment" in html_body
    assert "#222831" in html_body

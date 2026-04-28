class EmailNotValidError(ValueError):
    pass


class ValidatedEmail:
    def __init__(self, email: str) -> None:
        normalized = email.strip()
        if "@" not in normalized:
            raise EmailNotValidError("An email address must have an @-sign.")
        local_part, _, domain_part = normalized.partition("@")
        if not local_part or not domain_part:
            raise EmailNotValidError("The email address is not valid.")
        self.normalized = normalized
        self.local_part = local_part


def validate_email(email: str, check_deliverability: bool = False) -> ValidatedEmail:
    return ValidatedEmail(email)

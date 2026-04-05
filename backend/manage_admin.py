from __future__ import annotations

import argparse
import getpass

from .config import load_settings
from .db import connect, create_admin, ensure_default_notice_seed, has_any_admin, initialize_database
from .security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Reserve admin backend utilities")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_user = subparsers.add_parser("create-user", help="Create an admin account")
    create_user.add_argument("username")
    create_user.add_argument("display_name")

    args = parser.parse_args()
    settings = load_settings()

    connection = connect(settings.database_path)
    try:
        initialize_database(connection)
        ensure_default_notice_seed(connection)

        if args.command == "create-user":
            password = getpass.getpass("Password: ")
            if len(password) < 8:
                raise SystemExit("Password must be at least 8 characters.")
            create_admin(
                connection,
                username=args.username.strip(),
                display_name=args.display_name.strip(),
                password_hash=hash_password(password),
            )
            print(f"Created admin user: {args.username}")
            return 0
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Shared SQL construction; domain modules supply explicit field whitelists."""
from psycopg import sql


def update_columns(conn, table, key_column, key, changes, allowed) -> int:
    """Change only allowed columns. Empty updates are a no-op; None clears a value."""
    unknown = changes.keys() - allowed
    if unknown:
        raise ValueError(f"Unsupported update fields: {sorted(unknown)}")
    if not changes:
        return 0
    statement = sql.SQL("UPDATE {} SET {} WHERE {} = %s").format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(column)) for column in changes),
        sql.Identifier(key_column),
    )
    return conn.execute(statement, (*changes.values(), key)).rowcount

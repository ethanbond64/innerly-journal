#!/bin/zsh
# Delete a user and all their data (entries, tags, xrefs, local files).

INNERLY_DIR="$HOME/.innerly"
DB_PATH="$INNERLY_DIR/database.db"
USER_FILES_DIR="$INNERLY_DIR/static"

printf "User ID: "
read USER_ID
printf "Email: "
read EMAIL

if [ -z "$USER_ID" ] || [ -z "$EMAIL" ]; then
    echo "Both user ID and email are required."
    return 2>/dev/null || exit 1
fi

if ! [[ "$USER_ID" = <-> ]]; then
    echo "User ID must be a number."
    return 2>/dev/null || exit 1
fi

if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    return 2>/dev/null || exit 1
fi

# Verify user exists and email matches
ACTUAL_EMAIL=$(sqlite3 "$DB_PATH" "SELECT email FROM users WHERE id = $USER_ID;")
if [ -z "$ACTUAL_EMAIL" ]; then
    echo "No user found with ID $USER_ID."
    return 2>/dev/null || exit 1
fi
if [ "$ACTUAL_EMAIL" != "$EMAIL" ]; then
    echo "Email does not match user $USER_ID. Expected '$ACTUAL_EMAIL', got '$EMAIL'."
    return 2>/dev/null || exit 1
fi

# Count what will be deleted
ENTRY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM entries WHERE user_id = $USER_ID;")
TAG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tags WHERE user_id = $USER_ID;")
USER_DIR="$USER_FILES_DIR/user-$USER_ID"

echo ""
echo "This will permanently delete:"
echo "  User:    $EMAIL (id=$USER_ID)"
echo "  Entries: $ENTRY_COUNT"
echo "  Tags:    $TAG_COUNT"
if [ -d "$USER_DIR" ]; then
    echo "  Files:   $USER_DIR"
fi

echo ""
printf 'Type "yes" to confirm: '
read CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    return 2>/dev/null || exit 0
fi

sqlite3 "$DB_PATH" "DELETE FROM entry_tag_xref WHERE entry_id IN (SELECT id FROM entries WHERE user_id = $USER_ID) OR tag_id IN (SELECT id FROM tags WHERE user_id = $USER_ID);"
sqlite3 "$DB_PATH" "DELETE FROM entries WHERE user_id = $USER_ID;"
sqlite3 "$DB_PATH" "DELETE FROM tags WHERE user_id = $USER_ID;"
sqlite3 "$DB_PATH" "DELETE FROM users WHERE id = $USER_ID;"

echo "Database records deleted."

if [ -d "$USER_DIR" ]; then
    rm -rf "$USER_DIR"
    echo "Deleted $USER_DIR"
fi

echo "Done."

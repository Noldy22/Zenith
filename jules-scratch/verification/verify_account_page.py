
import pytest
from playwright.sync_api import Page, expect
import time

def test_account_page_password_fields_removed(page: Page):
    """
    This test verifies that the password confirmation fields have been removed
    from the account page.
    """
    time.sleep(60) # Wait for the dev server to start
    # 1. Arrange: Sign up a new user and log in.
    # Use a unique email to avoid conflicts with existing users.
    unique_email = f"testuser_{int(time.time())}@example.com"
    page.goto("http://localhost:3000/auth/signup")

    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Email").fill(unique_email)
    page.get_by_label("Password").fill("password123")
    page.get_by_role("button", name="Sign Up").click()

    # Wait for navigation to the dashboard after signup.
    expect(page).to_have_url("http://localhost:3000/dashboard", timeout=10000)

    # 2. Act: Navigate to the account page.
    page.goto("http://localhost:3000/account")

    # Wait for the page to load.
    expect(page.get_by_role("heading", name="My Account")).to_be_visible()

    # 3. Assert: Check that the password confirmation fields are not present.
    # Check "Update Name" form
    update_name_form = page.locator("form", has_text="Update Name")
    expect(update_name_form.get_by_label("Confirm Password")).not_to_be_visible()

    # Check "Change Password" form
    change_password_form = page.locator("form", has_text="Change Password")
    expect(change_password_form.get_by_label("Current Password")).not_to_be_visible()

    # 4. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")

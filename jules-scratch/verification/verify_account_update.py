from playwright.sync_api import Page, expect
import time

def test_account_page_update(page: Page):
    """
    This test verifies that a user can update their name on the account page.
    """
    time.sleep(60) # Wait for the dev server to start
    # 1. Arrange: Sign up a new user and log in.
    unique_email = f"testuser_{int(time.time())}@example.com"
    page.goto("http://localhost:3000/auth/signup")

    page.get_by_label("Username").fill("testuser")
    page.get_by_label("Email").fill(unique_email)
    page.get_by_label("Password").fill("password123")
    page.get_by_role("button", name="Sign Up").click()

    expect(page).to_have_url("http://localhost:3000/dashboard", timeout=10000)

    # 2. Act: Navigate to the account page.
    page.goto("http://localhost:3000/account")

    expect(page.get_by_role("heading", name="My Account")).to_be_visible()

    # 3. Act: Fill in the update name form and submit.
    new_name = "new_test_name"
    page.get_by_label("Username").fill(new_name)
    page.get_by_role("button", name="Save Name").click()

    # 4. Assert: Check for the success toast.
    expect(page.locator("text=Name updated successfully!")).to_be_visible(timeout=10000)

    # 8. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/account-page-updated.png")

from playwright.sync_api import Page, expect
import time

def test_account_page_update(page: Page):
    time.sleep(30) # Wait for the dev server to start
    # 1. Arrange: Go to the signin page.
    page.goto("http://localhost:3000/auth/signin")

    # 2. Act: Log in.
    page.get_by_label("Email").fill("test@example.com")
    page.get_by_label("Password").fill("password")
    page.get_by_role("button", name="Login").click()

    # 3. Assert: Wait for navigation to the dashboard and find the user name.
    expect(page).to_have_url("http://localhost:3000/dashboard")
    user_link = page.get_by_role("link", name="test")
    expect(user_link).to_be_visible()

    # 4. Act: Click the user link to go to the account page.
    user_link.click()

    # 5. Assert: Check that we are on the account page.
    expect(page).to_have_url("http://localhost:3000/account")
    expect(page.get_by_role("heading", name="My Account")).to_be_visible()

    # 6. Act: Fill in the update name form.
    page.get_by_label("Username").fill("new_test_name")
    page.get_by_label("Confirm Password").fill("password")
    page.get_by_role("button", name="Save Name").click()

    # 7. Assert: Check for the success toast.
    expect(page.locator("text=Name updated successfully!")).to_be_visible()

    # 8. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/account-page-updated.png")

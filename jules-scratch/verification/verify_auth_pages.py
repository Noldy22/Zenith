from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Sign up page with password verification
    page.goto("http://localhost:3000/auth/signup")
    page.screenshot(path="jules-scratch/verification/signup.png")

    # Sign in page with forgot password link
    page.goto("http://localhost:3000/auth/signin")
    page.screenshot(path="jules-scratch/verification/signin.png")

    # Reset password page
    page.goto("http://localhost:3000/auth/reset-password?token=test")
    page.screenshot(path="jules-scratch/verification/reset-password.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)

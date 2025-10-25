from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    time.sleep(15) # Wait for the server to start
    # Simulate the redirect from the backend with a dummy token
    dummy_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsImV4cCI6MTc2NzIyNTYwMH0.Y-o-JYt_0-U_g-J-A-p-Y-o-JYt_0-U_g-J-A-p-Y-o"
    page.goto(f"http://localhost:3000/auth/verify-token?token={dummy_token}")
    page.wait_for_url("http://localhost:3000/dashboard")
    page.screenshot(path="jules-scratch/verification/dashboard.png")
    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)

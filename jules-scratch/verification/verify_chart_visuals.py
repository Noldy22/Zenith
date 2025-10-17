import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Add a delay to allow the server to start
        await asyncio.sleep(10)

        await page.goto("http://localhost:3000/charts")

        # Wait for the chart to load
        await expect(page.locator(".tv-lightweight-charts")).to_be_visible(timeout=30000)

        # Click the "Connect MT5" button
        await page.get_by_role("button", name="Connect MT5").click()

        # Fill in the connection details
        await page.get_by_label("Login ID").fill("12345")
        await page.get_by_label("Password").fill("password")
        await page.get_by_label("Server").fill("MetaQuotes-Demo")

        # Click the "Connect" button
        await page.get_by_role("button", name="Connect", exact=True).click()

        # Wait for the connection to establish and data to load
        await expect(page.get_by_text("Loading chart data...")).to_be_hidden(timeout=30000)

        # Click the "Analyze" button
        await page.get_by_role("button", name="Analyze").click()

        # Wait for the analysis to complete
        await expect(page.get_by_text("Performing advanced analysis...")).to_be_hidden(timeout=30000)

        # Take a screenshot
        await page.screenshot(path="jules-scratch/verification/verification.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
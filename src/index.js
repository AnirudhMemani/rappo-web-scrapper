const puppeteer = require("puppeteer");
const fs = require("fs");

// Function to scrape champion information
async function scrapeChampionData(vendorPages) {
    const browser = await puppeteer.launch({ headless: true });
    const champions = [];

    for (const vendor of vendorPages) {
        const { name, url } = vendor;
        const page = await browser.newPage();

        try {
            console.log(`Scraping ${name}...`);
            await page.goto(url, { waitUntil: "domcontentloaded" });

            // Scrape the main page for champions
            const vendorChampions = await page.evaluate(() => {
                const data = [];
                const caseStudies = document.querySelectorAll(".case-study");

                caseStudies.forEach((study) => {
                    const championName = study.querySelector(".champion-name")?.textContent?.trim() || null;
                    const championRole = study.querySelector(".champion-role")?.textContent?.trim() || null;
                    const company = study.querySelector(".champion-company")?.textContent?.trim() || null;

                    if (championName && championRole && company) {
                        data.push({ name: championName, role: championRole, company });
                    }
                });

                return data;
            });

            for (const champion of vendorChampions) {
                const anchorLinks = await page.evaluate(() =>
                    Array.from(document.querySelectorAll("a[href*='linkedin.com']")).map((a) => a.href)
                );

                for (const linkedinURL of anchorLinks) {
                    console.log(`Navigating to LinkedIn URL: ${linkedinURL}`);
                    const linkedInPage = await browser.newPage();
                    await linkedInPage.goto(`${linkedinURL}`, { waitUntil: "domcontentloaded" });

                    // Scrape company size or other details from LinkedIn
                    const companySize = await linkedInPage.evaluate(() => {
                        const sizeElement = Array.from(document.querySelectorAll("dd")).find((dd) =>
                            dd.textContent.includes("employees")
                        );
                        return sizeElement ? sizeElement.textContent.trim() : "Unknown";
                    });

                    linkedInPage.close();

                    // Add LinkedIn-sourced data
                    champion.companySize = companySize;
                }

                champion.source = url; // Add source URL
                champions.push(champion);
            }

            console.log(`Scraped ${vendorChampions.length} champions from ${name}`);
        } catch (error) {
            console.error(`Failed to scrape ${name}:`, error.message);
        } finally {
            await page.close();
        }
    }

    await browser.close();
    return champions;
}

// Main script
(async () => {
    const vendorPages = [
        { name: "Datadog", url: "https://www.datadoghq.com/customers/" },
        { name: "HashiCorp", url: "https://www.hashicorp.com/case-studies" },
        { name: "Elastic", url: "https://www.elastic.co/customers" },
    ];

    try {
        const champions = await scrapeChampionData(vendorPages);

        // Filter champions based on criteria
        const filteredChampions = champions.filter((champion) => {
            const roleLower = champion.role?.toLowerCase() || "";
            const companySize = parseInt(champion.companySize) || 250; // Replace with a real check from a company info API if needed
            return (
                (roleLower.includes("director") || roleLower.includes("staff")) &&
                companySize >= 250 &&
                companySize <= 2500 &&
                !champion.company.match(/(google|amazon|microsoft|facebook|uber|linkedin)/i)
            );
        });

        // Save results to a JSON file
        fs.writeFileSync("src/champions.json", JSON.stringify(filteredChampions, null, 2));
        console.log(`Scraped and filtered champions saved to champions.json`);
    } catch (error) {
        console.error("Error:", error.message);
    }
})();

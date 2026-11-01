# Farm Profit Hub - Team 9 App Prototype

Click-through prototype of the Team 9 Vertical Farming solution ("Where Did the Profit Go?").
Saint Louis University, Master's Research Project 02, Fall 2026.

Team: Sirivennela Bontha, Madhu Sri Nagabhyru, Raviteja Mallela, Nandini Sridhar Bodigum

## What it shows
- Sign-in page with three roles. No password is needed.
- Customer Portal: restaurant orders, household subscription boxes, order tracking
- Staff Portal: order queue, harvest and sale form with live profit check and waste alert, harvest planner, entries
- Management Dashboard: KPIs, margin alerts, cost per kg by crop, crop x channel ranking, pricing tool
- Data Flow page: live API log and database tables (matches the Enterprise Architecture)
- Tutorial page plus an 8-step guided tour

Dataset 1 (1,200 records, Jan-Aug 2026) is preloaded as historical data. New entries are saved in the browser.
"Reset demo" restores the starting data.

## Files
index.html, styles.css, app.js, seed.js (Dataset 1), assets/chart.umd.js (Chart.js 4.4.1).
Static site: no build step and no server needed. Works on GitHub Pages.

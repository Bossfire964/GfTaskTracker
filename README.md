# Relationship Runway

Static GitHub Pages app for tracking important yearly dates and the prep deadlines tied to them.

## Files

- `index.html`: app shell and modal editor
- `styles.css`: layout and visual design
- `app.js`: Supabase-backed calendar, upcoming list, and event editor
- `config.js`: project-specific Supabase config
- `supabase-schema.sql`: tables and policies to create in Supabase

## Supabase setup

1. In Supabase, open the SQL editor and run `supabase-schema.sql`.
2. In the `access_codes` table, create one row per person/browser code you want to use.
3. Recommended columns to fill:
   - `label`: human name like `Luke` or `Deniz`
   - `code`: the code they will type on the login page
4. Open `config.js` and replace:
   - `supabaseUrl`
   - `supabaseAnonKey`
5. In Supabase `Project Settings -> API`, copy the project URL and anon public key.

## Hosting on GitHub Pages

1. Push the repo to GitHub.
2. In GitHub repo settings, enable Pages from the main branch root.
3. Bookmark the resulting Pages URL.

## Notes about privacy

This version uses a lightweight code gate, not real authentication. The browser stores the selected code in localStorage, and the planner filters data by that code owner. This is convenient for 2 or 3 trusted users, but it is not strong security.

## How recurring deadlines work

- `yearly` events show up every year using the same month/day.
- Deadlines can either be:
  - `days_before_event`: good for gift prep or outfit planning
  - `specific_date`: good for fixed dates you want attached to the event
- The app automatically creates deadline occurrence rows for the current and next year so completion can be tracked per year.

## Code flow

- A user enters a shared code in the browser.
- The app looks up that code in `access_codes`.
- The browser stores that selected code locally and reloads the same planner next time.
- `Switch code` clears the saved browser state and returns to the code screen.

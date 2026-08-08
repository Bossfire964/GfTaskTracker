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
2. Open `config.js` and replace:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `workspaceKey` if you want a different shared dataset label
3. In Supabase `Project Settings -> API`, copy the project URL and anon public key.
4. Keep this repo private if you do not want the config public in source control.

## Hosting on GitHub Pages

1. Push the repo to GitHub.
2. In GitHub repo settings, enable Pages from the main branch root.
3. Bookmark the resulting Pages URL.

## Notes about privacy

This app has no login. Anyone with the deployed source and your public anon key can inspect the frontend behavior, and the current SQL policies allow anonymous reads and writes. That is acceptable for a lightweight personal tool, but it is not strong security.

## How recurring deadlines work

- `yearly` events show up every year using the same month/day.
- Deadlines can either be:
  - `days_before_event`: good for gift prep or outfit planning
  - `specific_date`: good for fixed dates you want attached to the event
- The app automatically creates deadline occurrence rows for the current and next year so completion can be tracked per year.

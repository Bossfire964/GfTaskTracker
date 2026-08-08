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
2. In `Authentication -> Providers`, enable Email and magic-link login.
3. In `Authentication -> URL Configuration`, add:
   - your GitHub Pages URL
   - `http://localhost:8000`
4. In `Authentication -> Users`, create the small set of users who should have access.
5. Open `config.js` and replace:
   - `supabaseUrl`
   - `supabaseAnonKey`
6. In Supabase `Project Settings -> API`, copy the project URL and anon public key.

## Hosting on GitHub Pages

1. Push the repo to GitHub.
2. In GitHub repo settings, enable Pages from the main branch root.
3. Bookmark the resulting Pages URL.

## Notes about privacy

This app uses Supabase Auth with magic-link email login. The anon key is still public in the frontend, but planner data is protected by Row Level Security so each authenticated user can only access their own rows.

## How recurring deadlines work

- `yearly` events show up every year using the same month/day.
- Deadlines can either be:
  - `days_before_event`: good for gift prep or outfit planning
  - `specific_date`: good for fixed dates you want attached to the event
- The app automatically creates deadline occurrence rows for the current and next year so completion can be tracked per year.

## Auth flow

- A user enters their email in the browser.
- Supabase sends a magic link.
- Opening that link in the same browser signs the user in and loads only their planner data.
- Logging out returns the browser to the sign-in screen.

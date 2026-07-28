## Overview
The application uses a layered architecture:

## Frontend
Lovable-generated React/Vite application provides:
- dashboards
- forms
- household views
- budget tracking
- debt payoff visualization

## Backend
Supabase provides:
- PostgreSQL database
- authentication
- authorization
- Row Level Security

## Data Ownership
Every household-owned table contains household_id.

## Security Model
Users authenticate individually but share identical household data.

## Mobile
Capacitor packages the web application as an Android application distributed through Google Play Internal Testing.
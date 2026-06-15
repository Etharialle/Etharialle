# SupperStack Privacy Policy

Last updated: June 15, 2026

SupperStack helps Android users turn recipe links into clean, editable recipe cards for meal planning.

## Information the app handles

SupperStack may handle the following information when you use the app:

- Recipe links that you paste into the app or share to SupperStack from another Android app.
- Recipe drafts and saved recipe cards, including titles, ingredients, cooking steps, timing, servings, temperatures, source URLs, and notes.
- Recipe import usage, such as successful imports, failed imports, quota or balance status, and high-level failure categories.
- Internal testing credentials or app configuration values if you enter them in Settings for a test build.
- Purchase and entitlement records if paid recipe import packs or subscriptions are enabled, such as product IDs, purchase tokens, order/subscription status, and import balances.
- Technical information needed to operate and protect the service, such as request timestamps, source hostnames, rate-limit signals, and server error information.

Saved recipe cards are stored locally on your device.

## Recipe import

When you ask SupperStack to import a recipe from a link, the app sends the recipe URL to a backend service operated for SupperStack. That service fetches the recipe page and uses OpenAI's API to help convert the page into a structured recipe draft.

Do not submit recipe links or notes that contain sensitive personal information.

The backend may record high-level import metadata so we can operate the service, limit abuse, estimate costs, troubleshoot failures, and enforce usage limits. We do not intend to store full fetched recipe page text in operational logs.

## Recipe import balances and purchases

SupperStack may offer a limited number of server-backed recipe imports and paid ways to get more imports. Manual recipes and locally saved recipe cards do not require paid imports.

When purchases are enabled, Google Play handles payment processing. SupperStack may receive purchase tokens and related purchase/subscription status from Google Play so the backend can verify purchases, prevent duplicate grants, restore purchases, and maintain import balances.

Internal development builds may use mock purchase flows or tester credentials. Closed testing should use Google Play test purchases/subscriptions so purchase behavior can be validated through Google Play before production launch.

## Moderation and policy enforcement

SupperStack may use automated safety checks to detect submitted recipe pages or URLs that appear to violate safety policies, including NSFW, abuse, malware, harassment, or other disallowed content. If repeated or severe violations occur, SupperStack may limit access to server-backed recipe imports.

For enforcement, we aim to store only minimal evidence, such as timestamp, policy category, moderation result, source hostname or URL hash, action taken, and support/admin notes. We do not intend to store explicit content snippets or full fetched page text for enforcement history.

## Information we do not collect

SupperStack does not currently require account creation, collect payment card details in the app, access your contacts, access your precise location, or sell your personal information.

Google Play may process payment information when you make purchases through Google Play. SupperStack receives only the purchase information needed to verify and restore entitlements.

## Third-party services

SupperStack's recipe import backend uses OpenAI's API to process recipe-page content and generate recipe drafts. SupperStack may also rely on Google Play services for app distribution, purchases, subscriptions, crash reporting, or platform security features provided by Google Play.

## Data retention

Saved recipes remain on your device unless you delete the app data or uninstall the app. Recipe import requests may be processed transiently by the backend service and third-party API providers as needed to provide the import feature.

Import usage, purchase, entitlement, rate-limit, and moderation metadata may be retained as needed to operate the service, restore purchases, support users, prevent abuse, meet legal or accounting obligations, and understand service reliability. We aim to keep detailed operational data only as long as reasonably needed, then delete or aggregate it.

## Your choices

- You can add recipes manually instead of using server-backed recipe imports.
- You can delete saved recipes from the app.
- For privacy questions, or help with server-side billing/import records where legally possible, contact supperstack.support@gmail.com.
- To request deletion of server-side SupperStack data, email supperstack.support@gmail.com with the subject line “SupperStack data deletion request.”

Deleting server-side entitlement records may affect remaining import balances unless purchases can be restored from Google Play.

## Security

SupperStack is designed so the OpenAI API key is used by the backend service rather than embedded in the mobile app. No method of electronic transmission or storage is perfectly secure, but we use reasonable safeguards for the app's intended use.

## Children's privacy

SupperStack is a general-audience recipe and meal-planning app. It is not designed to collect personal information from children.

## Changes to this policy

This policy may be updated as SupperStack changes. Updates will be posted at the same privacy policy URL.

## Contact

For privacy questions or data deletion requests, contact:

supperstack.support@gmail.com

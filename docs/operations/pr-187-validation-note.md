# PR 187 validation target

This PR corrects the SYSTEM_USER asset validation path discovered by the real production OAuth test. The previous `/{system-user-id}/assigned_ad_accounts` call returned Meta GraphMethodException code 100. The validation now asks the authenticated principal for `/me/adaccounts` and proves Pixel access from those accounts. No production identifiers, tokens, or secrets are stored in this document.

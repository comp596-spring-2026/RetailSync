# Authentication Wireframes

Paths: [client/src/modules/auth/pages](/Users/trupal/Projects/RetailSync/client/src/modules/auth/pages)

## Current Public Auth Surface

- Login
- Register
- Accept Invite
- Forgot Password
- Reset Password
- Verify Email
- Onboarding
- Create Company
- Join Company

## Login Sketch

```text
+------------------------------------------------------+
|                     [ LOGO ]                         |
|                                                      |
|  Email                                               |
|  [................................................]  |
|                                                      |
|  Password                                            |
|  [................................................]  |
|                                                      |
|  [ Sign in ]                                         |
|                                                      |
|  Create account   Forgot password   Verify email     |
|                                                      |
|  -------------------- or --------------------        |
|                                                      |
|  [ Continue with Google ]                            |
+------------------------------------------------------+
```

## Register Sketch

```text
+------------------------------------------------------+
|                     [ LOGO ]                         |
|                                                      |
|  First name                                          |
|  Last name                                           |
|  Email                                               |
|  Password                                            |
|                                                      |
|  [ Create account ]                                  |
+------------------------------------------------------+
```

## Invite Acceptance Sketch

```text
+------------------------------------------------------+
|                     [ LOGO ]                         |
|                                                      |
|  invited email and company shown as read-only        |
|                                                      |
|  First name                                          |
|  Last name                                           |
|  Password                                            |
|                                                      |
|  [ Accept invite ]                                   |
+------------------------------------------------------+
```

## Onboarding Sketch

```text
+------------------------------------------------------+
|                     [ LOGO ]                         |
|                                                      |
|  Welcome to RetailSync                               |
|                                                      |
|  [ Create Company ]                                  |
|  [ Join Company ]                                    |
+------------------------------------------------------+
```

## Create Company Sketch

```text
+------------------------------------------------------+
|                     [ LOGO ]                         |
|                                                      |
|  Company Name                                        |
|  Business Type                                       |
|  Address                                             |
|  Phone                                               |
|  Company Email                                       |
|                                                      |
|  [ Create company ]                                  |
|                      or                              |
|  [ Connect company ]                                 |
+------------------------------------------------------+
```

## UX Rules

- Auth pages should stay narrow and calm.
- No decorative per-page icons are needed above the form.
- Invite users should not paste codes manually when a signed email link is available.
- Company creation happens after user creation, not during base account registration.

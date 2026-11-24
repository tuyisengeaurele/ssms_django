# Privacy wording (draft)

For the owner to read and approve before anything goes on the privacy page. Legal text is not changed by the code.

## Suggested English text: your phone number

**Your phone number.** We ask for a Rwandan mobile number when you create an account. We use it to reach you about your silk farming on SSMS: your supervisor can call you or message you on WhatsApp, and the SSMS team can contact you if something needs your attention. Only you, your supervisor and the SSMS team can see it. Another farmer never sees your number. We do not sell it or share it with advertisers. You can change your number in Settings, Account. Each account has a different number, so we cannot accept a number that another account already holds. To remove your number, you have to close your account, because an account needs one.

## Suggested English text: closing your account

**Closing your account.** A farmer can close their own account in Settings, Close account, after typing their email and giving their password. The account is removed 30 days later. Until then you can sign in and keep it. When it is removed, we delete your name, email address, phone number, photo, sign in records, recovery codes and notification choices, and the email address and number can be used again. Your farms, rooms, batches and harvests stay in the cooperative's records as history, without your name, because other people's figures are made of them. Supervisors and administrators ask the SSMS team to close their accounts.

## Suggested English text: downloading your data

**Your data.** You can download a copy of what SSMS holds about you in Settings, Your data. It is one file with your profile, farms, rooms, batches, harvests, photo check results, allowance and cooperative history, and the security events about your account from the last 180 days. It does not hold your photos or your password. You need your password to download it, and you can download it 3 times an hour.

## Suggested English text: your photo

**Your photo.** You can add a photo to your account in Settings. We keep it as a small square picture, and we remove the place and the camera details that photos carry. Only you, your supervisor and the SSMS team (and, for a supervisor, the farmers of the cooperative) are shown it. Anyone who is given the address of the picture can open it, so we change the address each time you change the photo. You can remove it at any time, and closing your account removes it.

## Suggested English text: records we keep

**Records we keep.** Security events about your account (signing in, changing your email or password, closing your account) are kept for 180 days. Our log of who changed what is kept without a time limit, so it can still hold the email address you had before you changed it or closed your account.

## Things to check before it is used

- The last sentence above is the one the code does not make true yet: the audit log keeps old email addresses and is never pruned. The owner decides whether to keep it that way and say so, or to ask for a change.
- Whether "30 days" is the right time. It is the setting `ACCOUNT_DELETION_GRACE_DAYS`, and the dialog says it as fixed text.
- Whether farms, rooms, batches and harvests staying "as history, without your name" is how the owner wants to say it, and whether the cooperative may need to be told.
- Whether supervisors and administrators should be able to close their own accounts. Today they ask the SSMS team.
- Whether "anyone who is given the address can open it" is acceptable for a profile photo, or whether it has to be behind a sign in (that needs a different way of showing it, and every list would fetch each photo with the token).
- Whether WhatsApp messages are really planned for this year, or only calls.
- The French and Kinyarwanda versions need a native speaker. They are not written here on purpose.
- Rwandan law on personal data (Law No. 058/2021) may need the purpose and the right to ask for deletion to be named. The owner decides the wording.

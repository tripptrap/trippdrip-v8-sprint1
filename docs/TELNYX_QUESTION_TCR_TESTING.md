Hi — a question about testing 10DLC registration before we launch.

We are a SaaS platform. Each of our customers registers their own 10DLC brand
and campaign through our app, using our Telnyx account. We expect 100-1000 of
these over the next 12 months, one number each.

Our problem is that we cannot test that flow without paying for it. So far
exactly one real registration has ever gone through — our own — and it took
eight campaign submissions to complete.

We have tried mock mode (`mock: true`). It confirms our API payload is correct,
but the mock brand returns identityStatus VERIFIED immediately without any real
identity check, and the mock campaign stays at TCR_PENDING forever with
isTMobileRegistered false. So it never exercises the part we actually need to
test.

What we want to verify is the middle step, not the end:

  Is there any way to submit a brand or campaign so that TCR genuinely
  evaluates it — real vetting, real approve or reject — WITHOUT it going on to
  MNO/carrier provisioning?

In other words, can a campaign be reviewed by TCR and then stopped before the
carriers are involved? We are trying to find out whether a given customer's
business details and use case would be accepted, without provisioning something
we do not intend to use.

Related questions:

1. Is the $15 review fee charged at TCR submission or at MNO provisioning? If a
   campaign is rejected by TCR, is the fee still charged?

2. Is there a sandbox or staging tier that performs real TCR vetting? Mock mode
   appears to skip vetting entirely rather than simulate it.

3. Can mock brands and campaigns be deleted? We have three mock brands on the
   account and both DELETE calls fail:
     DELETE /10dlc/brand/{id}     -> 500
     DELETE /10dlc/campaign/{id}  -> 404
   If they cannot be removed, we would rather do our testing on a separate
   Telnyx account. Is that supported, or is there a better approach for a
   platform registering campaigns on behalf of many customers?

4. For a platform like ours, is there a recommended pattern for pre-checking a
   customer's brand details before submitting — anything that reduces rejected
   submissions and repeat fees?

Thanks.

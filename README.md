# Player Review Site v104

Match Review loading improvements:
- Match Review no longer force-reloads stats JSON every time.
- Selected match data is prefetched in the background when Match Review opens / match changes.
- Rendered Match Review HTML is cached per match during the session.
- Loading state shows the selected match while data is being prepared.

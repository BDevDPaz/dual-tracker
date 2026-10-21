import type { supportEs } from "./supportEs";

/** English mirror of supportEs. TypeScript fails if a key is missing. */
export const supportEn: typeof supportEs = {
  title: "Support",
  blurb: "A guide for every screen, common questions, and a practice mode that does not touch your records.",
  helpButton: "Help for this screen",
  guideTitle: "Guide",
  open: "Open Support",
  manual: "Manual",
  screensTitle: "Help by screen",
  faqTitle: "Common questions",
  troubleTitle: "Troubleshooting",
  glossaryTitle: "What each state means",
  missing: "That guide is not in this version.",
  related: "Walkthroughs for this screen",
  walk: {
    next: "Next",
    back: "Back",
    done: "Done",
    step: "Step {n} of {total}",
    lookFor: "Look for this control",
    practice: "Practice this flow",
  },
  about: {
    line: "Version {version} ({channel}) · build {build}",
    linePlain: "Version {version} · build {build}",
  },
  export: {
    action: "Share diagnostic",
    ok: "Diagnostic ready to share",
    fail: "The diagnostic could not be shared",
  },
  tips: {
    dismiss: "Got it, don't show again",
    reset: "Show the tips again",
    resetDone: "Tips will show again at the right moment",
    transferSameSession: "Heading to another site? Use Start travel and Confirm arrival on the same shift so the drive is paid.",
    confirmArrivalInside: "If you are already inside the site, the phone sometimes does not notify you. Tap Confirm arrival.",
    lunch: "Start lunch pauses the trace. When you close, choose how many minutes to deduct.",
    provisionalSeal: "This pack was sealed before the week ended. It is not the final close: if hours change, generate another. The earlier seal is not rewritten.",
    splitWeek: "A shift that crosses the week boundary is split: you will see “continues on Mon” (or the next day) and, on the other week, “continues from …”.",
    zeroRows: "Zero-minute rows are left off the employee receipt. They stay on the employer pack.",
    forgotClock: "If you forgot to clock, correct the start and end on the session with a note. It is stored as a manual adjustment, not as validated.",
    samsungBattery: "On a Samsung, if the battery restricts the app or it is sleeping, the geofence may not clock you in. Check Health.",
    readDiag: "In Health, Geofence diagnostic says whether the entry was accepted and why it was rejected. It does not show a map.",
  },
  practice: {
    title: "Practice mode",
    banner: "Practice mode",
    watermark: "PRACTICE",
    exit: "Exit practice mode",
    enter: "Enter practice mode",
    reset: "Reset the demo",
    isolated: "This is demo data. It is not saved to your records, the integrity log, or the geofence.",
    notPayroll: "The figures below are a fixed example. They do not go through payroll math.",
    siteA: "North job (demo)",
    siteB: "South job (demo)",
    nextMonday: "Mon",
    simulateEnter: "Simulate a geofence entry",
    autoClose: "Simulate an automatic close",
    detectExit: "Simulate leaving the site",
    viewStatement: "View the sample receipt",
    hideStatement: "Hide the receipt",
    minutesLabel: "Minutes",
    noteLabel: "Practice note",
    provisional: "Sample seal, before the week ends. It is not a real pack.",
    hiddenZero: "This 0-minute row is not printed on the employee receipt.",
    hours: "8.00 h",
    amount: "$160.00",
    minutes: "480 min",
    zeroMinutes: "0 min",
    zeroAmount: "$0.00",
    errors: {
      ILLEGAL: "That step does not match the practice state.",
      NOTE_REQUIRED: "Write a note: without it the adjustment is not kept, even in practice.",
      ALREADY_OPEN: "A practice shift already exists. Close it if it is still open, or reset the demo. A second one is not opened.",
    },
  },
  marks: {
    continuesMonday: "continues on Mon",
  },
  flows: {
    startManual: {
      title: "Start a shift by hand",
      s0: {
        title: "Pick the site",
        body: "On Today, tap Start shift and choose a saved site. If a shift is already open, the app will not open another.",
      },
      s1: {
        title: "You are waiting",
        body: "The shift moves to Waiting for arrival and the geofence watches only that site. The time you tapped is not the arrival time yet.",
      },
      s2: {
        title: "If you were already inside",
        body: "If the phone was already inside the radius, the entry alert sometimes never arrives. Tap Confirm arrival to clock in on the same shift.",
      },
    },
    startGeofence: {
      title: "Start and clock in with the geofence",
      s0: {
        title: "Allow all the time",
        body: "On a Samsung the permission must be Allow all the time, with precise location on. “While using the app” is not enough to clock in with the screen off.",
      },
      s1: {
        title: "The entry clocks you in",
        body: "With the shift on Waiting for arrival, entering the radius can move it to On site. The time is the event time, not the time you opened the app.",
      },
      s2: {
        title: "If it did not clock in, read the diagnostic",
        body: "Open Health and read Geofence diagnostic. An accepted entry confirms the clock-in. Rejected explains why: accuracy, permission, a region from another shift, or something else.",
      },
    },
    arrival: {
      title: "Arrival and check-in",
      s0: {
        title: "Two paths, one shift",
        body: "Arrival can be automatic, from a geofence entry, or manual, with Confirm arrival. Both leave the shift On site.",
      },
      s1: {
        title: "Which time counts",
        body: "The accepted event time counts, or the time you confirmed. The start you declared when you opened the day is kept for comparison.",
      },
    },
    transfer: {
      title: "Travel and several sites",
      s0: {
        title: "The same shift",
        body: "Heading to another site? Do not tap New shift. When you leave, choose Start travel and the other site. The drive stays on the same shift so it is paid.",
      },
      s1: {
        title: "Confirm arrival",
        body: "When you arrive, tap Confirm arrival or let the geofence clock you in. Cancel travel does not create a travel line.",
      },
      s2: {
        title: "Several sites",
        body: "You can travel again on the same session. The geofence watches the current site, not all of them at once. The drive from home, before the first arrival, is not paid travel.",
      },
    },
    lunch: {
      title: "Lunch and breaks",
      s0: {
        title: "Start lunch",
        body: "On site, Start lunch moves to At lunch. There is no trace during the break.",
      },
      s1: {
        title: "When you close",
        body: "When you close, you choose whether to deduct lunch. If the shift crosses the start of another workday, the app asks what time lunch started so it is deducted on the right day.",
      },
      s2: {
        title: "Resume",
        body: "Resume returns to On site. Finish shift closes from lunch.",
      },
    },
    closeManual: {
      title: "Close the shift by hand",
      s0: {
        title: "Close on site",
        body: "On site, Close shift asks about lunch and closes at the current time.",
      },
      s1: {
        title: "Close when you leave",
        body: "If you left the radius, Exit detected offers Close shift. Confirm exit uses the time of the first exit, not the latest one.",
      },
    },
    closeAuto: {
      title: "Automatic close",
      s0: {
        title: "If you do not answer",
        body: "If you do not decide the exit in time, the watchdog can close on its own. The shift is marked Auto, for review, and is not silently marked Validated.",
      },
      s1: {
        title: "Other causes",
        body: "It can also close at the maximum open length, after a confirmed abandonment, or if location is lost. The log says automatic close.",
      },
    },
    editNote: {
      title: "Edit the session with a note",
      s0: {
        title: "Open the session",
        body: "From History or Today, open the session and tap Edit.",
      },
      s1: {
        title: "The note is required",
        body: "If you change the start or end time, the audit note is required. The previous times are kept and the class becomes Adjustment. If the clock time does not change, the hours are not rewritten.",
      },
    },
    forgotClock: {
      title: "I forgot to clock",
      s0: {
        title: "It is not invented",
        body: "If you never opened the day, open it when you remember and correct the start. The app does not create a past shift on its own.",
      },
      s1: {
        title: "It stays an adjustment",
        body: "The change is called a manual adjustment and is not Validated. The pack shows it. If you delete the session, it still remains on record as deleted.",
      },
    },
    sealShare: {
      title: "Seal and share",
      s0: {
        title: "Generate the pack",
        body: "In Reports, with closed shifts, Generate pack seals the week. If sessions need review, resolve them or export with a not-certified seal.",
      },
      s1: {
        title: "A seal before Sunday",
        body: "You can seal before the week ends. The banner says it is not the final close: if you add shifts or correct one that crosses midnight, generate another. The earlier seal is not rewritten.",
      },
      s2: {
        title: "Share",
        body: "Share employee receipt or employer pack opens the system share sheet. The SHA-256 code is how the two copies are compared.",
      },
    },
    readStatement: {
      title: "Read the pay statement",
      s0: {
        title: "The split week",
        body: "A shift that crosses the week boundary is shown as two rows. Where it started you will see “continues on Mon” (or the next day). On the other week, “continues from …”.",
      },
      s1: {
        title: "The minutes column",
        body: "Each row shows the minutes of that slice. Hours are written so the rows add up to the total. Money is integer cents: each line rounds and the total is the sum.",
      },
      s2: {
        title: "The zero rows",
        body: "A zero-minute slice is kept for the audit. On the employee receipt those $0 rows are not printed. They stay on the employer pack, and a note says how many were omitted.",
      },
    },
    states: {
      title: "What each state means",
      s0: {
        title: "The shift",
        body: "Off duty, Waiting for arrival, On site, At lunch, Traveling, Exit detected, and Shift closed are the machine. Only one shift can be open.",
      },
      s1: {
        title: "Integrity",
        body: "Validated is the clean class. Adjustment is a manual change with a note. Auto is a close by the system. Needs review is a conflict between GPS and what was declared, and it has to be resolved.",
      },
      s2: {
        title: "Not certifiable",
        body: "Not certifiable is not an integrity class. It is a block: notes or locations were stored unencrypted on this device. Hours remain; a certified seal does not.",
      },
    },
  },
  screens: {
    today: {
      title: "Today",
      intro: "Today is the shift control: start, arrive, lunch, travel, and close. If the shift needs review because the phone went quiet, confirm the end here or keep working. The timer and the site come from the real state.",
      s0: { title: "The large action", body: "The main button follows the state. Off duty it is Start shift. While traveling it is Confirm arrival." },
      s1: { title: "Do not open another shift", body: "If you are going to another site, use Start travel on the same shift. New shift is for when the previous one is already closed." },
    },
    history: {
      title: "History",
      intro: "History lists the week's shifts, with integrity filters and the slices that cross Sunday.",
      s0: { title: "The week", body: "The arrows change the week. All shows the full history; the other filters stay on the selected week." },
      s1: { title: "The split row", body: "If a shift continues on Monday, the row says “continues on Mon”. A shift in review for abandonment is marked in the list: open it to confirm the end or keep working." },
    },
    reports: {
      title: "Reports",
      intro: "Reports summarizes a range (week, pay period, month, or dates) split into work weeks. Overtime is not mixed across weeks. A seal is still one week.",
      s0: { title: "The range", body: "Current week and previous week match the work calendar. The pay period is the 1st–15th or the 16th through the end of the month. Custom asks for two dates. More than a year is rejected." },
      s1: { title: "Seal", body: "Each week is sealed on its own, with the same calculation as always. The sum above does not reallocate overtime." },
    },
    settings: {
      title: "Settings",
      intro: "Settings stores the profile and language, the PIN (local or employer), the portal, and retention status. It also opens Health, sites, and Support.",
      s0: { title: "The PIN", body: "Until the employer provisions the phone, the first person sets a local PIN. The label says so. A one-time code is pasted once and it expires. The first key asks for the fingerprint the employer gave on another channel." },
      s1: { title: "The portal", body: "With no https address, nothing is sent: Employer portal: not configured. Turning it on needs the admin area and an https address." },
    },
    session: {
      title: "Session",
      intro: "The session shows what you declared, what the zone confirmed, the integrity, the lines, and the notes. If it needs review for abandonment, confirm the end here or keep working.",
      s0: { title: "Edit", body: "Edit asks for a note if you change the hours. The previous times stay on record." },
      s1: { title: "Activity", body: "The timeline comes from the log, not from a fixed list. Each step (arrival, travel, close) is an entry." },
    },
    trace: {
      title: "Trace",
      intro: "The trace draws the shift on the phone, without a street map and without sending coordinates. The point list stays underneath.",
      s0: { title: "The plane", body: "The line is the breadcrumb. The circle is the geofence. The arrival mark is an entry; another mark is travel to the next site. An exit is a dot. North is up." },
      s1: { title: "Gaps", body: "A missing stretch is not invented. If retention already purged it, the notice says so. An unreliable point is not shown as a clean arrival." },
    },
    sites: {
      title: "Job sites",
      intro: "Job sites are the places with a geofence. Creating one does not start watching: watching starts when you start the shift.",
      s0: { title: "New site", body: "New site asks for a name and address. Without a resolved point there is no geofence and arrival will be manual." },
      s1: { title: "Several sites", body: "You can keep several. When you travel you pick the next one; the geofence watches one at a time." },
    },
    siteNew: {
      title: "New site",
      intro: "This is where you add a site. Saving does not open the shift and does not register the system geofence.",
      s0: { title: "The address", body: "The address has to resolve to a point. If it does not, Today can still start, but it will not clock in by itself." },
      s1: { title: "The radius", body: "The radius is the geofence circle. Too small fails with the car's GPS; too large clocks you in from the next street." },
    },
    siteEdit: {
      title: "Job site",
      intro: "You can correct the name, address, or radius. If this is the site the open shift is watching, the geofence uses the new data when you save.",
      s0: { title: "Save", body: "Save applies the change. Archive removes it from the active list and does not delete visits already made." },
      s1: { title: "The radius", body: "If you change the radius mid-shift, the watched zone is rebuilt with the new value." },
    },
    health: {
      title: "Operational health",
      intro: "Health shows permissions, battery, the clock, and the Geofence diagnostic. Each sensor says whether it blocks VALIDATED or is only a warning. It also lists shifts in review.",
      s0: { title: "Geofence diagnostic", body: "Each row is time, type, region, accuracy, and whether it was accepted. There is no map and no coordinates. Location, the foreground service, and the clock block VALIDATED. Battery, notifications, and the network only warn." },
      s1: { title: "Repair", body: "Repair opens the matching system setting: location, notifications, or battery." },
    },
    conflict: {
      title: "Resolve a conflict",
      intro: "Sessions that need review are here. You cannot leave while one is still undecided.",
      s0: { title: "Keep GPS", body: "Keep GPS stays with the zone fact." },
      s1: { title: "Accept the adjustment", body: "Accept manual adjustment requires a note. Split divides the shift in two when there was an overlap." },
    },
    statement: {
      title: "Pay statement",
      intro: "The week's statement shows minutes, hours, and the total. The numbers are already calculated: this screen does not recompute them.",
      s0: { title: "The lines", body: "Each line has the day, the kind, and the minutes. The amount is that line's amount, in dollars and cents." },
      s1: { title: "Minutes", body: "The minutes column is the time of that slice. A slice that continues on Monday is read as “continues on Mon” in history and on the pack." },
    },
    pack: {
      title: "Sealed pack",
      intro: "The saved pack has the SHA-256 code, the seal time, and the files. Sharing does not rewrite it.",
      s0: { title: "The code", body: "Employee and employer can compare the same code. If you generate again, the new code is different and the old one stays on file." },
      s1: { title: "Share", body: "The employee receipt omits $0 rows. The employer pack keeps them." },
    },
    welcome: {
      title: "Welcome",
      intro: "Dual Tracker separates your time and the shift trace. The trace exists only while a shift is open.",
      s0: { title: "Continue", body: "There is no way to skip setup. The next step is the location disclosure." },
      s1: { title: "What it is for", body: "Hours, lunch, travel, and the pack are built from what you clock, not from a hidden calculation." },
    },
    onboardingDisclosure: {
      title: "Disclosure",
      intro: "The disclosure explains what location is stored and who it can be shared with. You have to accept it to continue.",
      s0: { title: "Read it", body: "The text is the same one you will later see under Legal. Accepting marks the current version." },
      s1: { title: "Without accepting", body: "Without the disclosure accepted, the shift does not start." },
    },
    permissions: {
      title: "Permissions",
      intro: "Location while in use is for check-in. Background location, set to Allow all the time, is required for the geofence with the screen off.",
      s0: { title: "Background", body: "If you deny background location you can continue, but shifts cannot be certified as validated." },
      s1: { title: "Alerts", body: "Notifications announce the exit and the morning reminder. Without them an automatic close can happen before you decide." },
    },
    profile: {
      title: "Your profile",
      intro: "Name, rate, language, and reminder time. The company and the PIN are set later, in the admin area.",
      s0: { title: "Language", body: "Español or English changes the setup screens that are still open, before you tap Enter." },
      s1: { title: "Enter", body: "Enter saves the profile on this phone. The rate can later be changed only with the admin PIN." },
    },
    legalDisclosure: {
      title: "Current disclosure",
      intro: "This is the legal text in force, the same one from setup. Changing the interface language shows it in that language; it does not ask you to accept again.",
      s0: { title: "Read only", body: "You consult it from Settings. It is not edited here." },
      s1: { title: "Back", body: "Back returns to Settings or to the setup step you came from." },
    },
    legalRetention: {
      title: "Retention",
      intro: "The retention policy says how long the trace is kept on the phone.",
      s0: { title: "Both conditions", body: "A period's trail is deleted only if that period was already exported and the retention days have also passed since it ended. If it was not exported, it is kept." },
      s1: { title: "Back", body: "Back returns without changing anything." },
    },
    notFound: {
      title: "Not found",
      intro: "The link does not match a session, a pack, or a screen in this version.",
      s0: { title: "Go to Today", body: "Go to Today leaves you on the shift control." },
      s1: { title: "Back", body: "If you arrived from another app, go back or open Today." },
    },
    boot: {
      title: "Opening",
      intro: "On launch the records stored on the phone are opened. This screen does not start a shift.",
      s0: { title: "Wait", body: "Restoring records is normal. When it finishes you land on Today or on setup." },
      s1: { title: "If it fails", body: "If it cannot open, Try again attempts it once more. It does not delete data on its own." },
    },
    support: {
      title: "Support",
      intro: "Manual, help for each screen, questions, problems, states, practice, and a diagnostic you can share.",
      s0: { title: "The manual", body: "Each walkthrough can be followed step by step. The highlighted control is the one on the real screen." },
      s1: { title: "Practice", body: "Enter practice mode uses demo data, separate from your records." },
    },
    practice: {
      title: "Practice mode",
      intro: "Here you can start, arrive, travel, take lunch, close, add a note, and seal without writing your records.",
      s0: { title: "The banner", body: "While you see Practice mode, what you tap stays in the demo." },
      s1: { title: "Exit", body: "Exit clears the demo and you return to your real shifts, exactly as they were." },
    },
  },
  faq: {
    commute: {
      q: "Is the drive from home paid?",
      a: "No. Time from home to the first site is not paid. Paid travel is what you declare, on the same shift, between two sites: Start travel and then Confirm arrival.",
    },
    sameSession: {
      q: "Why not start a new shift when I drive to another job?",
      a: "Because the drive is paid only inside the shift that is already open. Start travel and Confirm arrival keep both sites and the drive on the same session.",
    },
    alwaysAllow: {
      q: "What is Allow all the time?",
      a: "It is Android's background location permission. It is required for the geofence to clock you in with the screen off. “While using the app” is not enough.",
    },
    precise: {
      q: "What is precise location?",
      a: "It is fine GPS, not only the phone network. If it is off, accuracy can be worse than the radius and the diagnostic rejects the entry.",
    },
    samsung: {
      q: "What do I do on a Samsung with aggressive battery limits?",
      a: "Remove Dual Tracker from sleeping apps, set the battery to unrestricted, and do not let Doze optimize it. Otherwise the system puts the geofence to sleep.",
    },
    autoFail: {
      q: "Why did I not clock in automatically when I arrived?",
      a: "The permission, the accuracy, or the battery may have failed, or you were already inside when the geofence armed and Android did not send the entry. Confirm arrival covers that case. The exact reason is in Health.",
    },
    readDiag: {
      q: "How do I read the Geofence diagnostic?",
      a: "In Health, each row is an entry, exit, sample, or error. Accepted means the shift advanced. Rejected includes the reason, for example accuracy larger than the radius or missing Allow all the time. It does not store or show coordinates.",
    },
    notifications: {
      q: "What are the notifications for?",
      a: "They announce that you left the site, with buttons to stay, close, or travel, plus the morning reminder. Without them you may not notice an exit.",
    },
    language: {
      q: "Does the language change the guides and the PDFs?",
      a: "The interface, including these guides, changes at once. A PDF that is already sealed is not rewritten: it stays as it was generated.",
    },
    provisional: {
      q: "Can I seal in the middle of the week?",
      a: "Yes. That seal is provisional: the banner says so. If you later add or correct shifts, generate another pack. The earlier one is not modified.",
    },
    splitWeek: {
      q: "What does “continues on Mon” mean?",
      a: "The shift crossed the week boundary. This week's row shows up to the boundary and says it continues on the next day, often Monday. The other week shows the rest.",
    },
    zeroRows: {
      q: "Why is a zero-minute shift missing from the receipt?",
      a: "The employee receipt hides 0-minute and $0 rows. The employer pack keeps them, and a note says how many were omitted.",
    },
    practice: {
      q: "Does practice mode mix with my hours?",
      a: "No. It lives somewhere else on the phone, not in the shift database, the integrity log, the packs, or the geofence. When you exit, your real data is unchanged.",
    },
    offline: {
      q: "Do the guides need the internet?",
      a: "No. The text ships inside the app, with the guide number you see in Support. They read the same with no signal.",
    },
    orphanShift: {
      q: "What is a shift in review for abandonment?",
      a: "If the phone stopped checking in for longer than the heartbeat gap and there is no reading inside the site, the shift is not closed on its own. On Today, in the detail, and in Health you can confirm the end time, with a note, or keep working. Hours are not invented.",
    },
    validSensors: {
      q: "What blocks a VALIDATED shift?",
      a: "Location (while in use, in the background, and the system location services), the foreground service, and clock integrity. Battery, notifications, the network, and the geofence only warn. Health marks each row.",
    },
    clockDrift: {
      q: "What if the phone clock does not match network time?",
      a: "When online, the app compares the clock with two well-known sites. It uses the round-trip midpoint and drops a slow sample. It records drift only when several spaced readings agree, and only once per shift. If that shift already has good location evidence, the drift stays a warning and does not remove validated status. A jump of the phone clock itself does flag the shift for review. Offline, network time does not block.",
    },
    packSignature: {
      q: "Is the pack signed?",
      a: "New packs carry a signature from the phone (Ed25519) next to the verification code and the key fingerprint. Older packs, without a signature, stay valid. A PDF that was already sealed is not rewritten. A signature that checks out does not identify the phone unless that fingerprint is compared with the one recorded separately.",
    },
    retentionBoth: {
      q: "When is the trail deleted?",
      a: "Only if the period was already exported and the retention days have passed since that period ended. Both. An unexported period is left alone. Entries and exits are kept. On the plane, what was deleted shows as a gap, not as an invented line.",
    },
    employerPin: {
      q: "Who sets the admin PIN?",
      a: "If the employer has not provisioned the phone, the first person to use it sets it. Settings calls that a local PIN (not provisioned by the employer). A one-time code, which expires, installs the employer PIN. The PIN is not inside the code: it is told separately. The first key is not pinned on its own: you type the fingerprint the employer gave you on another channel, or the build has that key anchored. A different key is rejected until you unlock the admin area. After several wrong tries the phone waits; the lockout steps stay the same.",
    },
    employerPortal: {
      q: "Are packs sent to a portal?",
      a: "No, unless the admin area enters an https address and turns sending on. Without that, Settings says Employer portal: not configured and nothing leaves the phone. The queue shows pending, sent, or failed. A failure waits and retries. The PDF is not uploaded: the signed manifest, the pay statement, and the evidence summary are sent.",
    },
    reportRange: {
      q: "Can I see more than one week in Reports?",
      a: "Yes. Current week, previous week, pay period, month, or two dates. The end cannot be before the start, and the range cannot exceed one year. Overtime is calculated week by week, the same as the pack. Sealing is still one week.",
    },
    offlineMap: {
      q: "Does the trail map use the internet?",
      a: "No. There are no streets and no maps key. The plane is drawn from points already on the phone. A purged stretch stays a gap. Encrypted coordinates are read only here, to draw them.",
    },
  },
  trouble: {
    permissionAlways: {
      title: "The permission is not Allow all the time",
      body: "Phone settings, Apps, Dual Tracker, Permissions, Location, and choose Allow all the time. In Health, Background must say Granted. Repair opens that screen.",
    },
    preciseLocation: {
      title: "Precise location is off",
      body: "In the Samsung location permission, turn on Use precise location. Without it the diagnostic can say accuracy is larger than the radius and reject the entry.",
    },
    samsungBattery: {
      title: "Samsung: battery, sleeping apps, and Doze",
      body: "Settings, Battery and device care, Background usage limits. Remove Dual Tracker from Sleeping apps and from inactive apps. On the app's page, Battery, choose Unrestricted. That way Doze does not sleep the geofence while a shift is open.",
    },
    autoCheckIn: {
      title: "Automatic check-in did not happen",
      body: "Confirm Allow all the time, precise location, and unrestricted battery. If you were already inside when you started, tap Confirm arrival: Android often does not repeat the entry. Then open Health and read the latest diagnostic row.",
    },
    readDiag: {
      title: "How to read the Geofence diagnostic",
      body: "Health, Geofence diagnostic section. Read the time, the type (entry, exit, sample, error), and whether it says Accepted or Rejected. The translated reason is underneath: permission, accuracy, a stale region, or no open shift. You will not see coordinates: they are not stored in that list.",
    },
    notifications: {
      title: "Exit alerts are not arriving",
      body: "In Health, Notifications must be Granted. On a Samsung, also check that the app's notifications are not silenced. Without that permission the stay, close, and travel buttons do not appear.",
    },
    language: {
      title: "The language did not change in a guide",
      body: "In Support, or in Settings, tap Español or English. The guide you are reading changes at once. If a PDF you already shared is still in Spanish, that is expected: the sealed file is not regenerated.",
    },
    commute: {
      title: "The drive from home did not show up as paid travel",
      body: "That is how the app works: that leg is not paid. For the drive between two jobs to count, it has to be paid travel on the same shift, with arrival confirmed at the second site.",
    },
  },
  glossary: {
    manualPatch: "Manual adjustment is the name of an hours change with a note. On the integrity pill it reads Adjustment, not Validated.",
    machine: {
      NO_INICIADA: "Off duty: no shift is open. You can start one.",
      ESPERANDO: "Waiting for arrival: the shift is open and the geofence is watching the site. It is not on-site time yet.",
      ACTIVA: "On site: you arrived, by hand or by geofence. Time at the site is running.",
      PAUSADA: "At lunch: a break with no trace. Resume returns to On site.",
      TRASLADO: "Traveling: you are going to another site inside the same shift. Confirm arrival closes the leg.",
      SALIDA: "Exit detected: the system saw you leave and is waiting for your decision. The time that counts is the first exit.",
      CERRADA: "Shift closed: time is no longer running. You can review it or start another.",
    },
    integrity: {
      VALID: "Validated: the shift had no manual adjustment, no automatic close, and no open conflict.",
      MANUAL: "Adjustment: someone changed the hours and left a note, or an adjustment was accepted while resolving a conflict. It is not Validated.",
      AUTO: "Auto: the system closed it (exit window, maximum length, or another automatic cause). It stays distinct from a validated shift.",
      CONFLICT: "Needs review: GPS and what was declared do not match, or integrity was degraded. Resolve it before a certified seal.",
      BLOCKED: "Not certifiable: an encryption block, not a pill class. Notes or locations were stored unencrypted on this device. Hours are kept; a certified seal is not.",
    },
  },
};

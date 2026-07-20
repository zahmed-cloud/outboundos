/* Outbound OS content pack. Starter messages written in an operator voice.
   Rewrite the [bracketed] parts for YOUR offer. {first} and {co} fill
   automatically when you copy. */

const TPL={
 "default": {
  "conn": "Hi {first}, came across {co} and thought it was worth connecting. No pitch, just building a proper network in the space.",
  "m1": "Appreciate the connect {first}. Out of interest, how is [the problem you solve] currently handled at {co}? Asking because most owners I speak to are juggling it themselves alongside everything else. That is the exact thing I work on. Happy to run you through it if useful, and if not, ignore me and crack on.",
  "f1": "Hey {first}, keeping this short. If it ever keeps getting pushed aside when you're busy, I'll send a short rundown of how we handle it. No call needed, just reply and it's yours.",
  "f2": "Last one from me {first}. If it's all covered at {co}, good luck out there. If it's the thing that keeps slipping to Friday afternoon, you know where I am."
 }
};

const REPLY={
 "interested": {
  "label": "They're interested",
  "tip": "Move to a call in this message. Two concrete times, plus an open door.",
  "txt": "Appreciate that {first}. Easier to walk through properly on a quick call, I can run you through how it would look for {co} and you can judge from there. Are you free sometime this week? I can do Thursday morning or Friday afternoon, or throw a time at me."
 },
 "price": {
  "label": "Asking about price",
  "tip": "Scope first, then your number with a straight face. Never defensive.",
  "txt": "Fair question. It depends on scope, so I would want to understand your setup properly before putting a number on it. Happy to share the range straight on a quick call, no games. Worth grabbing 15 minutes this week?"
 },
 "send_info": {
  "label": "Send me some info",
  "tip": "Info is usually a polite no. One page, then re-ask small.",
  "txt": "Can do {first}, I'll keep it to one page. The useful part though is ten minutes where I show what it would look like for {co} specifically. If the one pager makes sense, worth grabbing that slot?"
 },
 "not_now": {
  "label": "Not right now / bad timing",
  "tip": "No pressure, park a date 60 to 90 days out now.",
  "txt": "Understood {first}, timing beats everything. I'll leave it with you rather than chase. If it moves up the list next quarter, that is usually the right moment anyway. Mind if I check back in a couple of months?"
 },
 "using_someone": {
  "label": "Already using someone",
  "tip": "Never trash the incumbent. Ask about their numbers.",
  "txt": "That's good to hear, most people have nothing running at all. Out of interest, are you happy with the numbers on your side? If you ever want a second pair of eyes on them, happy to give you an honest read. Useful benchmark even if you never switch."
 },
 "who_are_you": {
  "label": "Who are you / is this spam?",
  "tip": "Straight answer, one proof point, re-ask the status question.",
  "txt": "Fair question. Real person. I run Ascent where we build structured outbound systems that help founders generate pipeline. You're hearing from me because {co} fits the profile we do our best work for. One question and I'll leave you be, how is new business currently handled on your side?"
 },
 "wrong_person": {
  "label": "Wrong person / not my area",
  "tip": "Ask for the forward. These convert absurdly well.",
  "txt": "Appreciate you telling me {first}. Who would be the right person at {co} for the pipeline side? Happy for you to just forward this along, one line from you beats ten from me."
 },
 "ghost": {
  "label": "Replied, then went quiet",
  "tip": "One casual bump, then the clean exit.",
  "txt": "Hey {first}, floating this back up, I know how inboxes get. Still happy to run you through the short version for {co}. If priorities shifted, one word and I'll close the file."
 }
};

const DEAL_TPL={
 "prop_chase1": {
  "label": "Chase proposal (day 3)",
  "txt": "Hey {first}, checking the proposal landed okay. Any questions I can clear up async? If something doesn't fit, tell me straight and I'll rework it."
 },
 "prop_chase2": {
  "label": "Chase or close (day 7)",
  "txt": "Hi {first}, guessing the proposal is sitting in the important but not urgent pile. Is this a not yet or a no? Both are fine on my side, I would just rather know than keep nudging."
 },
 "agree_chase": {
  "label": "Chase signature",
  "txt": "Hey {first}, agreement is ready when you are. Anything blocking it on your side, legal, timing, second opinion? Happy to jump on for five minutes and clear it."
 },
 "breakup": {
  "label": "Clean breakup",
  "txt": "Hi {first}, closing the loop on this one so I stop pestering you. If it comes back on the agenda at {co}, you know where I am. Good luck either way."
 }
};

/* What Claude knows about YOUR offer when drafting. Set yours in Settings —
   this default just keeps the AI honest until you do. */
const AI_PITCH_DEFAULT="No positioning set yet. Keep every draft generic about the offer: never invent services, prices, client names or results. Nudge toward a short call as the next step.";

const PREP_QS=["What happens if this stays exactly as it is for the next six months?",
 "Who else needs to be involved for this to go ahead?",
 "If we started Monday, what would success look like in ninety days?"];

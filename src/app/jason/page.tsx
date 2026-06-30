const calendarUrl = "#book-a-call";

const painPoints = [
  "The same mental loops keep coming back after brief moments of relief.",
  "More information has not created lasting peace.",
  "Therapy, coaching, spirituality, or self-help may have helped parts of life but not ended the seeking cycle.",
  "You want a grounded conversation before committing to private work."
];

const processSteps = [
  {
    number: "01",
    title: "Free clarity call",
    body: "A short fit conversation to understand what you are seeking, what you have tried, and whether this work is appropriate for you."
  },
  {
    number: "02",
    title: "Guided inquiry",
    body: "Private or small-group sessions focused on direct looking, live questions, and the patterns that keep mental noise active."
  },
  {
    number: "03",
    title: "Integration",
    body: "Simple reflection prompts and follow-up touchpoints help the conversation become practical instead of another abstract idea."
  }
];

const faqs = [
  {
    question: "Is this therapy?",
    answer: "No. This is not therapy, medical treatment, crisis support, or a replacement for professional mental healthcare. It is a guided inquiry process for people who are stable, sincere, and ready to look carefully at the root of seeking."
  },
  {
    question: "What happens on the free call?",
    answer: "The call is designed to determine fit. You can ask questions, explain what you are dealing with, and decide whether private or small-group sessions make sense."
  },
  {
    question: "What if I am skeptical?",
    answer: "Skepticism is welcome. The first step is not blind belief. The first step is an honest conversation about what this work is, what it is not, and whether it is right for you."
  },
  {
    question: "Who is this not for?",
    answer: "This is not for someone in crisis, someone seeking diagnosis or treatment, or someone who needs licensed clinical care. If that is your situation, seek qualified professional support first."
  }
];

export const metadata = {
  title: "Direct Pointing with Jason Walters | Free Clarity Call",
  description:
    "A clearer landing page for Jason Walters' direct pointing private and small-group sessions with a structured offer, fit call, and safer conversion path."
};

export default function JasonLandingPage() {
  return (
    <main className="min-h-screen bg-[#080B10] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(119,92,255,0.32),_transparent_35%),radial-gradient(circle_at_80%_20%,_rgba(34,197,94,0.18),_transparent_28%),linear-gradient(135deg,_#080B10_0%,_#101828_55%,_#0F172A_100%)]" />
        <div className="relative mx-auto grid min-h-[88vh] max-w-7xl grid-cols-1 gap-12 px-6 py-10 md:grid-cols-[1.05fr_0.95fr] md:px-10 lg:px-16">
          <div className="flex flex-col justify-center">
            <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
              Private & small group sessions
            </div>
            <h1 className="max-w-4xl text-5xl font-black tracking-[-0.06em] text-white md:text-7xl lg:text-8xl">
              Still searching for peace after trying everything?
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
              Direct Pointing with Jason Walters is an 8-week guided inquiry process for people who feel trapped in mental noise, seeking, and recurring dissatisfaction and want a clearer way to look at what keeps the cycle alive.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href={calendarUrl}
                className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_20px_60px_rgba(52,211,153,0.28)] transition hover:bg-emerald-300"
              >
                Book a free clarity call
              </a>
              <a
                href="#fit"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/8 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-white/14"
              >
                See if this is a fit
              </a>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">
              This page is structured to move visitors from curiosity to a qualified conversation, not just a text message or vague inquiry.
            </p>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-xl rounded-[2rem] border border-white/12 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-xl md:p-7">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6 md:p-8">
                <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">The current gap</p>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-white md:text-4xl">
                  Big promise. Weak conversion path.
                </h2>
                <p className="mt-5 text-base leading-7 text-slate-300">
                  A serious transformational offer needs more than “text or email me.” It needs a clear promise, trust-building copy, a fit call, qualification, reminders, and follow-up.
                </p>
                <div className="mt-7 grid gap-3">
                  {[
                    "Replace text/email with booked calls",
                    "Clarify the process before showing price",
                    "Add safety, fit, proof, and objection handling",
                    "Connect every lead to a CRM and nurture flow"
                  ].map((item) => (
                    <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                      <span className="text-sm leading-6 text-slate-200">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="fit" className="bg-[#F6F1E8] px-6 py-20 text-slate-950 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-700">Who this is for</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] md:text-6xl">
              For people tired of chasing the next answer.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {painPoints.map((point) => (
              <div key={point} className="rounded-3xl border border-slate-950/10 bg-white p-6 shadow-sm">
                <div className="mb-5 h-10 w-10 rounded-full bg-emerald-100" />
                <p className="text-base leading-7 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-slate-950 md:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-700">The path</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] md:text-6xl">
              A clearer 3-step journey from curiosity to commitment.
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {processSteps.map((step) => (
              <div key={step.title} className="rounded-[2rem] border border-slate-950/10 bg-slate-50 p-7">
                <div className="text-sm font-black uppercase tracking-[0.28em] text-emerald-700">{step.number}</div>
                <h3 className="mt-12 text-2xl font-black tracking-[-0.03em]">{step.title}</h3>
                <p className="mt-4 text-base leading-7 text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-6 py-20 text-white md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Offer structure</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] md:text-6xl">
              Private work and small-group options.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              The offer should be framed before price appears so visitors understand what they are considering and why a call is the natural next step.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-[2rem] border border-emerald-300/25 bg-white/[0.06] p-7">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Private</p>
              <h3 className="mt-5 text-3xl font-black">8 weekly sessions</h3>
              <p className="mt-3 text-5xl font-black tracking-[-0.05em]">$2,000</p>
              <p className="mt-5 text-sm leading-7 text-slate-300">Personalized guidance, live questions, and one-to-one attention for people who want focused support.</p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-7">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Small group</p>
              <h3 className="mt-5 text-3xl font-black">8 weekly sessions</h3>
              <p className="mt-3 text-5xl font-black tracking-[-0.05em]">$950</p>
              <p className="mt-5 text-sm leading-7 text-slate-300">A lower-friction group format for sincere participants who learn well through shared questions and discussion.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="book-a-call" className="bg-[#F6F1E8] px-6 py-20 text-slate-950 md:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_0.95fr]">
          <div className="rounded-[2rem] bg-slate-950 p-8 text-white md:p-10">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Free clarity call</p>
            <h2 className="mt-5 text-4xl font-black tracking-[-0.05em] md:text-6xl">
              Start with a conversation, not a commitment.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              This is where the HighLevel calendar should be embedded. The goal is to convert interest into a scheduled call with reminders, no-show follow-up, and CRM tracking.
            </p>
            <a
              href="mailto:jason@example.com?subject=Free%20Clarity%20Call%20Request"
              className="mt-8 inline-flex rounded-full bg-emerald-400 px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-300"
            >
              Request a clarity call
            </a>
          </div>
          <div className="rounded-[2rem] border border-slate-950/10 bg-white p-8 shadow-sm md:p-10">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-500">HighLevel stack</p>
            <div className="mt-6 grid gap-4">
              {[
                "Calendar booking widget",
                "Pre-call intake form",
                "SMS and email reminders",
                "Missed-call text-back",
                "Lead nurture sequence",
                "Pipeline tracking and offer follow-up"
              ].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl bg-slate-50 px-5 py-4">
                  <span className="font-bold text-slate-800">{item}</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-800">Ready</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 text-slate-950 md:px-10 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-700">Questions visitors need answered</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] md:text-6xl">Reduce skepticism before the call.</h2>
          <div className="mt-10 grid gap-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-3xl border border-slate-950/10 bg-slate-50 p-6">
                <h3 className="text-xl font-black tracking-[-0.02em]">{faq.question}</h3>
                <p className="mt-3 text-base leading-7 text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#080B10] px-6 py-16 text-white md:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-300">Jason Walters</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] md:text-5xl">Direct Pointing, packaged for conversion.</h2>
          </div>
          <a
            href={calendarUrl}
            className="inline-flex rounded-full bg-white px-7 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-200"
          >
            Book a free clarity call
          </a>
        </div>
      </section>
    </main>
  );
}

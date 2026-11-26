"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, UserPlus, Briefcase, HelpCircle, Sparkles, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { Interview } from "@/types/interview";

interface CreateInterviewFormProps {
  onInterviewCreated: (interview: Interview) => void;
  defaultCollapsed?: boolean;
}

interface QuestionField {
  id: string;
  question: string;
}

const DEFAULT_FORM_DATA = {
  job: {
    id: "JOB-react-001",
    title: "React.js Developer",
    company_name: "HyrGPT",
    description:
      "We are looking for a React.js developer with experience building modern web applications using React, JavaScript, TypeScript, Next.js, REST APIs, and modern frontend development practices.",
  },
  candidate: {
    id: "CAN-candidate-001",
    name: "Ramakanta Kar",
    phone: "1234567890",
    email: "ramakanta@example.com",
  },
  questions: [
    {
      id: "q1",
      question: "Tell me about your experience with React.js.",
    },
    {
      id: "q2",
      question: "What is the difference between useState and useRef in React?",
    },
    {
      id: "q3",
      question: "How do you optimize a React application that has unnecessary re-renders?",
    },
    {
      id: "q4",
      question: "Tell me about a challenging frontend project you have worked on.",
    },
    {
      id: "q5",
      question: "Why are you interested in this React.js developer position?",
    },
  ],
};

export const CreateInterviewForm: React.FC<CreateInterviewFormProps> = ({
  onInterviewCreated,
  defaultCollapsed = true,
}) => {
  const { success, error: toastError } = useToast();

  const [jobTitle, setJobTitle] = useState(DEFAULT_FORM_DATA.job.title);
  const [companyName, setCompanyName] = useState(DEFAULT_FORM_DATA.job.company_name);
  const [jobId, setJobId] = useState(DEFAULT_FORM_DATA.job.id);
  const [jobDescription, setJobDescription] = useState(DEFAULT_FORM_DATA.job.description);

  const [candidateName, setCandidateName] = useState(DEFAULT_FORM_DATA.candidate.name);
  const [candidateId, setCandidateId] = useState(DEFAULT_FORM_DATA.candidate.id);
  const [candidatePhone, setCandidatePhone] = useState(DEFAULT_FORM_DATA.candidate.phone);
  const [candidateEmail, setCandidateEmail] = useState(DEFAULT_FORM_DATA.candidate.email);

  const [questions, setQuestions] = useState<QuestionField[]>(DEFAULT_FORM_DATA.questions);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Set fresh dynamic IDs on initial page load / mount
  useEffect(() => {
    const timestamp = Date.now();
    setCandidateId(`CAN-${timestamp}`);
    setJobId(`JOB-${timestamp}`);
  }, []);

  const handleAddQuestion = () => {
    const nextNum = questions.length + 1;
    setQuestions([
      ...questions,
      {
        id: `q${nextNum}`,
        question: "",
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length <= 1) {
      toastError("Validation", "At least one question is required for an interview.");
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...questions];
    updated[index].question = value;
    setQuestions(updated);
  };

  const handleResetDefaults = () => {
    const timestamp = Date.now();
    setJobTitle(DEFAULT_FORM_DATA.job.title);
    setCompanyName(DEFAULT_FORM_DATA.job.company_name);
    setJobId(`JOB-${timestamp}`);
    setJobDescription(DEFAULT_FORM_DATA.job.description);
    setCandidateName(DEFAULT_FORM_DATA.candidate.name);
    setCandidateId(`CAN-${timestamp}`);
    setCandidatePhone(DEFAULT_FORM_DATA.candidate.phone);
    setCandidateEmail(DEFAULT_FORM_DATA.candidate.email);
    setQuestions([...DEFAULT_FORM_DATA.questions]);
    success("Defaults Loaded", "Pre-filled form with React.js Developer template.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jobTitle.trim() || !jobId.trim() || !jobDescription.trim()) {
      toastError("Validation Error", "All Job information fields are required.");
      return;
    }

    if (!candidateName.trim() || !candidateId.trim() || !candidatePhone.trim()) {
      toastError("Validation Error", "Candidate Name, ID, and Phone Number are required.");
      return;
    }

    const emptyQuestions = questions.filter((q) => !q.question.trim());
    if (emptyQuestions.length > 0) {
      toastError("Validation Error", "Please fill in text for all questions or remove blank ones.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        company_name: companyName.trim() || undefined,
        candidate: {
          id: candidateId.trim(),
          name: candidateName.trim(),
          phone: candidatePhone.trim(),
          email: candidateEmail.trim() || undefined,
        },
        job: {
          id: jobId.trim(),
          title: jobTitle.trim(),
          company_name: companyName.trim() || undefined,
          description: jobDescription.trim(),
        },
        questions: questions.map((q, idx) => ({
          id: q.id.trim() || `q${idx + 1}`,
          question: q.question.trim(),
        })),
      };

      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data?.error?.message || "Failed to create interview.";
        toastError("Creation Failed", msg);
        setIsSubmitting(false);
        return;
      }

      const createdInterview: Interview = data.data?.interview || data.interview;
      success("Interview Created", `Screening interview for ${candidateName} ready to call.`);
      onInterviewCreated(createdInterview);
      setIsCollapsed(true);

      // Generate fresh timestamp IDs for the next interview
      const nextTimestamp = Date.now();
      setCandidateId(`CAN-${nextTimestamp}`);
      setJobId(`JOB-${nextTimestamp}`);
    } catch {
      toastError("Error", "Could not connect to the API server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      glow="orange"
      className="border-[#222f49] bg-gradient-to-b from-[#131b2e]/95 via-[#101728]/95 to-[#0b101c]/95 shadow-xl transition-all duration-300 overflow-hidden"
    >
      {isCollapsed ? (
        /* ========================================================================= */
        /* PROPERLY CENTER-ALIGNED PROFESSIONAL COLLAPSED VIEW */
        /* ========================================================================= */
        <div
          onClick={() => setIsCollapsed(false)}
          className="group cursor-pointer p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4 hover:bg-[#162035]/50 transition-all duration-200 select-none"
        >
          {/* Centered Icon with subtle pulse glow */}
          <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400 group-hover:scale-105 group-hover:bg-orange-500/20 group-hover:border-orange-500/50 transition-all duration-300 shadow-md shadow-orange-950/40">
            <UserPlus className="h-7 w-7 text-orange-400" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
            </span>
          </div>

          {/* Centered Heading, Tag & Description */}
          <div className="space-y-1.5 max-w-xl mx-auto">
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-orange-400 transition-colors tracking-tight">
                Create AI Screening Interview
              </h3>
              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/30">
                Click to expand
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              Click to configure candidate details, job description, and custom AI interview questions to trigger an outbound telephony call.
            </p>
          </div>

          {/* Centered Action Button */}
          <div className="pt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(false);
              }}
              className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold shadow-lg shadow-orange-950/50 px-5 py-2 text-xs rounded-xl"
              leftIcon={<Plus className="h-4 w-4" />}
              rightIcon={<ChevronDown className="h-3.5 w-3.5 opacity-80" />}
            >
              New Interview
            </Button>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* EXPANDED VIEW */
        /* ========================================================================= */
        <>
          <div className="p-5 pb-4 border-b border-[#222f49] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e1627]/60">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 shrink-0">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Create AI Screening Interview
                </h3>
                <p className="text-xs text-slate-400">
                  Configure candidate details, job description, and custom AI interview questions
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetDefaults}
                className="text-xs text-orange-300 hover:text-orange-200"
                leftIcon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Load Defaults
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCollapsed(true)}
                className="text-xs border-[#222f49] text-slate-300 hover:text-white"
                leftIcon={<ChevronUp className="h-3.5 w-3.5" />}
              >
                Collapse Form
              </Button>
            </div>
          </div>

          <CardContent className="p-5 pt-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left Column: Job & Candidate Details */}
              <div className="space-y-5">
                {/* Job Information */}
                <div className="rounded-xl border border-[#222f49] bg-[#0c1220]/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400">
                    <Briefcase className="h-4 w-4" />
                    <span>Job Information</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Job Title *</label>
                      <input
                        type="text"
                        required
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g. React.js Developer"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Company Name</label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. HyrGPT, Acme Corp"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Job ID *</label>
                      <input
                        type="text"
                        required
                        value={jobId}
                        onChange={(e) => setJobId(e.target.value)}
                        placeholder="e.g. JOB-1725267123456"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs text-slate-300">Job Description *</label>
                    <textarea
                      required
                      rows={3}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Enter the role requirements and context for the AI agent..."
                      className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Candidate Information */}
                <div className="rounded-xl border border-[#222f49] bg-[#0c1220]/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
                    <UserPlus className="h-4 w-4" />
                    <span>Candidate Information</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Candidate Name *</label>
                      <input
                        type="text"
                        required
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        placeholder="e.g. Ramakanta Kar"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Candidate ID *</label>
                      <input
                        type="text"
                        required
                        value={candidateId}
                        onChange={(e) => setCandidateId(e.target.value)}
                        placeholder="e.g. CAN-1725267123456"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Phone Number * (E.164 / India)</label>
                      <input
                        type="tel"
                        required
                        value={candidatePhone}
                        onChange={(e) => setCandidatePhone(e.target.value)}
                        placeholder="e.g. 1234567890 or +919876543210"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <span className="text-[10px] text-slate-500">Auto-normalized to +91 if 10 digits</span>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs text-slate-300">Email Address (Optional)</label>
                      <input
                        type="email"
                        value={candidateEmail}
                        onChange={(e) => setCandidateEmail(e.target.value)}
                        placeholder="ramakanta@example.com"
                        className="w-full rounded-lg border border-[#222f49] bg-[#111827] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Questions List */}
              <div className="rounded-xl border border-[#222f49] bg-[#0c1220]/60 p-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                      <HelpCircle className="h-4 w-4" />
                      <span>Interview Questions ({questions.length})</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddQuestion}
                      className="text-xs py-1 px-2.5 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                    >
                      Add Question
                    </Button>
                  </div>

                  <p className="text-xs text-slate-400">
                    The Sarvam AI voice interviewer will ask these questions turn-by-turn and record the candidate&apos;s responses.
                  </p>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {questions.map((q, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 rounded-lg border border-[#222f49] bg-[#111827] p-2.5 transition-all focus-within:border-amber-500/50"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-[11px] font-mono font-semibold text-amber-300 border border-amber-500/20">
                          {q.id || `q${index + 1}`}
                        </span>

                        <input
                          type="text"
                          required
                          value={q.question}
                          onChange={(e) => handleQuestionChange(index, e.target.value)}
                          placeholder={`Question ${index + 1} text...`}
                          className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                        />

                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(index)}
                            aria-label={`Remove question ${index + 1}`}
                            className="rounded p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit Action Bar */}
                <div className="mt-4 pt-3 border-t border-[#222f49] flex items-center justify-between gap-3">
                  <span className="text-[11px] text-slate-400">
                    Supports 20+ questions • Live outbound voice execution
                  </span>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSubmitting}
                    leftIcon={<Check className="h-4 w-4" />}
                  >
                    Save & Create Interview
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        </>
      )}
    </Card>
  );
};

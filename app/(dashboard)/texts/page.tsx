"use client";

import { useEffect, useState, Suspense } from "react";
import OptOutGateModal from "@/components/texts/OptOutGateModal";
import TextsLayout from "@/components/texts/TextsLayout";

function TextsPageContent() {
  const [optOutKeyword, setOptOutKeyword] = useState<string | null>(null);
  const [showOptOutGate, setShowOptOutGate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if opt-out keyword is configured
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const keyword = data?.settings?.optOutKeyword || data?.settings?.opt_out_keyword || null;
        if (keyword) {
          setOptOutKeyword(keyword);
          setShowOptOutGate(false);
        } else {
          setShowOptOutGate(true);
        }
      })
      .catch(() => {
        setShowOptOutGate(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-sky-600/30 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (showOptOutGate) {
    return (
      <OptOutGateModal
        onConfigured={(keyword) => {
          setOptOutKeyword(keyword);
          setShowOptOutGate(false);
        }}
      />
    );
  }

  return <TextsLayout optOutKeyword={optOutKeyword || 'STOP'} />;
}

export default function TextsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-sky-600/30 border-t-sky-600 rounded-full animate-spin" />
      </div>
    }>
      <TextsPageContent />
    </Suspense>
  );
}

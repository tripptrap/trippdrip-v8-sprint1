"use client";

import { useState, useEffect } from "react";
import CustomModal from "@/components/CustomModal";

type DripMessage = {
  message: string;
  delayHours: number; // Hours to wait before sending this drip message
};

type ResponseOption = {
  label: string; // e.g., "Interested", "Not Interested", "More Info", "Pricing"
  followUpMessage: string;
  nextStepId?: string; // ID of the next step to go to
  action?: 'continue' | 'end';
};

type FlowStep = {
  id: string;
  yourMessage: string;
  responses: ResponseOption[];
  dripSequence?: DripMessage[]; // Follow-up messages if no response
  tag?: {
    label: string;
    color: string;
  };
};

type RequiredQuestion = {
  question: string; // e.g., "What's your household income?"
  fieldName: string; // e.g., "householdIncome"
};

type ConversationFlow = {
  id: string;
  name: string;
  steps: FlowStep[];
  requiredQuestions?: RequiredQuestion[]; // Questions that must be answered
  requiresCall?: boolean; // Whether this flow requires a phone/zoom call
  createdAt: string;
  updatedAt: string;
  isAIGenerated?: boolean; // Track if flow was created with AI
  is_ai_generated?: boolean; // Database field name (snake_case)
};

async function loadFlows(): Promise<ConversationFlow[]> {
  if (typeof window === "undefined") return [];

  try {
    const response = await fetch('/api/flows');
    const data = await response.json();

    if (data.ok && data.items) {
      // Map database format to app format
      return data.items.map((flow: any) => ({
        id: flow.id,
        name: flow.name,
        steps: flow.steps || [],
        requiredQuestions: flow.required_questions || [],
        requiresCall: flow.requires_call || false,
        createdAt: flow.created_at,
        updatedAt: flow.updated_at,
        isAIGenerated: flow.is_ai_generated
      }));
    }

    return [];
  } catch (e) {
    console.error("Error loading flows:", e);
    return [];
  }
}

async function saveFlowToServer(flow: ConversationFlow): Promise<boolean> {
  try {
    // Check if flow exists by looking for matching flow_config.id
    const checkResponse = await fetch('/api/flows');
    const checkData = await checkResponse.json();
    const existingFlow = checkData.ok && checkData.items && checkData.items.find((f: any) =>
      f.id === flow.id || f.flow_config?.id === flow.id
    );

    const method = existingFlow ? 'PUT' : 'POST';
    const response = await fetch('/api/flows', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: existingFlow?.id || flow.id,  // Use database ID for updates
        name: flow.name,
        steps: flow.steps,
        requiredQuestions: flow.requiredQuestions || [],
        requiresCall: flow.requiresCall || false,
        isAIGenerated: flow.isAIGenerated,
        description: ''
      })
    });

    const data = await response.json();
    return data.ok;
  } catch (e) {
    console.error("Error saving flow:", e);
    return false;
  }
}

async function deleteFlowFromServer(flowId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/flows?id=${flowId}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    return data.ok;
  } catch (e) {
    console.error("Error deleting flow:", e);
    return false;
  }
}

function saveFlows(flows: ConversationFlow[]) {
  // Save all flows to server async
  flows.forEach(flow => {
    saveFlowToServer(flow).catch(e => console.error("Error saving flow:", e));
  });
}

// Helper function to convert date/time strings to ISO format for Google Calendar API
// Helper function to generate camelCase field names from questions
function generateFieldName(question: string): string {
  // Remove question marks and other punctuation
  let cleaned = question.replace(/[?.,!;:'"]/g, '');

  // Split into words
  const words = cleaned.trim().split(/\s+/);

  // Convert to camelCase
  if (words.length === 0) return '';

  return words.map((word, idx) => {
    const lower = word.toLowerCase();
    if (idx === 0) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('');
}

function parseAppointmentDateTime(dateStr: string, timeStr: string): { start: string; end: string } {
  const now = new Date();
  let appointmentDate = new Date();

  // Parse date string
  const dateLower = dateStr.toLowerCase();
  if (dateLower === 'today') {
    appointmentDate = new Date(now);
  } else if (dateLower === 'tomorrow') {
    appointmentDate = new Date(now);
    appointmentDate.setDate(appointmentDate.getDate() + 1);
  } else {
    // Handle day names (Monday, Tuesday, etc.)
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = daysOfWeek.indexOf(dateLower);
    if (targetDay !== -1) {
      const currentDay = now.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget <= 0) daysUntilTarget += 7; // Next occurrence
      appointmentDate = new Date(now);
      appointmentDate.setDate(appointmentDate.getDate() + daysUntilTarget);
    }
  }

  // Parse time string (format: "5:00 PM", "2:30 AM", etc.)
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const period = timeMatch[3].toUpperCase();

    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    appointmentDate.setHours(hours, minutes, 0, 0);
  } else {
    // Default to 2:00 PM if parsing fails
    appointmentDate.setHours(14, 0, 0, 0);
  }

  // Create end time (1 hour after start)
  const endDate = new Date(appointmentDate);
  endDate.setHours(endDate.getHours() + 1);

  return {
    start: appointmentDate.toISOString(),
    end: endDate.toISOString()
  };
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<ConversationFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ConversationFlow | null>(null);
  const [showNewFlowDialog, setShowNewFlowDialog] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [flowContext, setFlowContext] = useState({
    whoYouAre: "",
    whatOffering: "",
    whoTexting: "",
    clientGoals: ""
  });
  const [requiredQuestions, setRequiredQuestions] = useState<RequiredQuestion[]>([]);
  const [requiresCall, setRequiresCall] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [stepPurpose, setStepPurpose] = useState("");
  const [insertAfterIndex, setInsertAfterIndex] = useState<number>(-1);
  const [showTestFlow, setShowTestFlow] = useState(false);
  const [testMessages, setTestMessages] = useState<Array<{role: 'agent' | 'user' | 'system', text: string, timestamp?: string}>>([]);
  const [testInput, setTestInput] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState(new Date());
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null);
  const [pendingDrips, setPendingDrips] = useState<Array<{message: string, scheduledFor: Date}>>([]);
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [showManualStepDialog, setShowManualStepDialog] = useState(false);
  const [manualStep, setManualStep] = useState<FlowStep>({
    id: '',
    yourMessage: '',
    responses: [],
    dripSequence: []
  });
  const [showManualFlowDialog, setShowManualFlowDialog] = useState(false);
  const [manualFlowName, setManualFlowName] = useState("");
  const [manualFlowMessage, setManualFlowMessage] = useState("");
  const [manualFlowSteps, setManualFlowSteps] = useState<string[]>([]);
  const [editingStepIndex, setEditingStepIndex] = useState<number>(-1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<ConversationFlow | null>(null);
  const [editingFlowName, setEditingFlowName] = useState(false);
  const [tempFlowName, setTempFlowName] = useState("");
  const [enableCalendarAppointments, setEnableCalendarAppointments] = useState(true);
  const [createdAppointments, setCreatedAppointments] = useState<Array<{title: string, date: string, time: string, eventId?: string, htmlLink?: string}>>([]);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  useEffect(() => {
    loadFlows().then(setFlows).catch(e => {
      console.error("Error loading flows:", e);
      setFlows([]);
    });
  }, []);

  function assignStepColors(steps: FlowStep[]): FlowStep[] {
    // Color progression: Blue -> Purple -> Orange -> Green (last step)
    const colors = ['#3B82F6', '#8B5CF6', '#F59E0B']; // Blue, Purple, Orange
    const greenColor = '#10B981'; // Green for last step

    return steps.map((step, index) => {
      const isLastStep = index === steps.length - 1;
      const color = isLastStep ? greenColor : colors[index % colors.length];

      return {
        ...step,
        tag: {
          label: step.id || `Step ${index + 1}`,
          color: color
        }
      };
    });
  }

  async function createNewFlow() {
    if (!newFlowName.trim() || !flowContext.whoYouAre || !flowContext.whatOffering || !flowContext.whoTexting) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please fill in all required fields'
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Filter out empty required questions and ensure field names are generated
      const validRequiredQuestions = requiredQuestions
        .filter(q => q.question.trim())
        .map(q => ({
          question: q.question,
          fieldName: q.fieldName || generateFieldName(q.question)
        }));

      const response = await fetch("/api/generate-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowName: newFlowName.trim(),
          context: flowContext,
          requiredQuestions: validRequiredQuestions,
          requiresCall: requiresCall
        })
      });

      const data = await response.json();

      if (data.steps) {
        // Assign automatic colors to steps (last step = green)
        const stepsWithColors = assignStepColors(data.steps);

        const newFlow: ConversationFlow = {
          id: Date.now().toString(),
          name: newFlowName.trim(),
          steps: stepsWithColors,
          requiredQuestions: validRequiredQuestions,
          requiresCall: requiresCall,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isAIGenerated: true
        };

        const updated = [...flows, newFlow];
        setFlows(updated);
        saveFlows(updated);
        setSelectedFlow(newFlow);
        setNewFlowName("");
        setFlowContext({ whoYouAre: "", whatOffering: "", whoTexting: "", clientGoals: "" });
        setRequiredQuestions([]);
        setRequiresCall(false);
        setShowNewFlowDialog(false);
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Generation Failed',
          message: 'Failed to generate flow. Please try again.'
        });
      }
    } catch (error) {
      console.error("Error generating flow:", error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error generating flow. Please try again.'
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function deleteFlow(flowId: string) {
    // Find the flow to check if it's AI-generated
    const flow = flows.find(f => f.id === flowId);
    if (flow) {
      setFlowToDelete(flow);
      setShowDeleteConfirm(true);
    }
  }

  async function confirmDeleteFlow() {
    if (!flowToDelete) return;

    // Delete from server first
    const success = await deleteFlowFromServer(flowToDelete.id);

    if (success) {
      // Only update local state if server deletion succeeded
      const updated = flows.filter(f => f.id !== flowToDelete.id);
      setFlows(updated);
      if (selectedFlow?.id === flowToDelete.id) {
        setSelectedFlow(null);
      }
      setShowDeleteConfirm(false);
      setFlowToDelete(null);
    } else {
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete flow. Please try again.'
      });
    }
  }

  function cancelDeleteFlow() {
    setShowDeleteConfirm(false);
    setFlowToDelete(null);
  }

  function updateStep(stepId: string, updates: Partial<FlowStep>) {
    if (!selectedFlow) return;

    const updatedSteps = selectedFlow.steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    );

    const updatedFlow = {
      ...selectedFlow,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    setSelectedFlow(updatedFlow);

    const updatedFlows = flows.map(f =>
      f.id === selectedFlow.id ? updatedFlow : f
    );
    setFlows(updatedFlows);
    saveFlows(updatedFlows);
  }

  function updateResponse(stepId: string, responseIndex: number, updates: Partial<ResponseOption>) {
    if (!selectedFlow) return;

    const updatedSteps = selectedFlow.steps.map(step => {
      if (step.id === stepId) {
        const updatedResponses = [...step.responses];
        updatedResponses[responseIndex] = { ...updatedResponses[responseIndex], ...updates };
        return { ...step, responses: updatedResponses };
      }
      return step;
    });

    const updatedFlow = {
      ...selectedFlow,
      steps: updatedSteps,
      updatedAt: new Date().toISOString()
    };

    setSelectedFlow(updatedFlow);

    const updatedFlows = flows.map(f =>
      f.id === selectedFlow.id ? updatedFlow : f
    );
    setFlows(updatedFlows);
    saveFlows(updatedFlows);
  }

  function addStep() {
    if (!selectedFlow) return;

    const stepNumber = selectedFlow.steps.length + 1;
    const newStep: FlowStep = {
      id: "step-" + Date.now(),
      yourMessage: "Your next message here...",
      responses: [
        { label: "Response 1", followUpMessage: "Your reply to Response 1..." },
        { label: "Response 2", followUpMessage: "Your reply to Response 2..." },
        { label: "Response 3", followUpMessage: "Your reply to Response 3..." },
        { label: "Response 4", followUpMessage: "Your reply to Response 4..." }
      ],
      tag: {
        label: `Step ${stepNumber}`,
        color: "#3B82F6" // Blue default
      }
    };

    const updatedFlow = {
      ...selectedFlow,
      steps: [...selectedFlow.steps, newStep],
      updatedAt: new Date().toISOString()
    };

    setSelectedFlow(updatedFlow);

    const updatedFlows = flows.map(f =>
      f.id === selectedFlow.id ? updatedFlow : f
    );
    setFlows(updatedFlows);
    saveFlows(updatedFlows);
  }

  function insertStepAfter(afterIndex: number) {
    setInsertAfterIndex(afterIndex);

    // Check if this is a manual flow (not AI generated)
    if (selectedFlow && selectedFlow.isAIGenerated === false) {
      // Show manual step dialog for manual flows
      setManualStep({
        id: `step-${Date.now()}`,
        yourMessage: '',
        responses: [],
        dripSequence: []
      });
      setEditingStepIndex(-1);
      setShowManualStepDialog(true);
    } else {
      // Show AI step dialog for AI-generated flows
      setShowStepDialog(true);
    }
  }

  function renumberSteps(steps: FlowStep[]): FlowStep[] {
    return steps.map((step, index) => {
      // Determine color based on position
      const colors = ['#3B82F6', '#8B5CF6', '#F59E0B']; // Blue, Purple, Orange
      const greenColor = '#10B981'; // Green for last step
      const isLastStep = index === steps.length - 1;
      const color = isLastStep ? greenColor : colors[index % colors.length];
      const newStepId = `step-${index + 1}`;

      return {
        ...step,
        id: newStepId,
        tag: {
          label: newStepId,
          color: color
        }
      };
    });
  }

  async function generateAndInsertStep() {
    if (!selectedFlow || !stepPurpose.trim()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please describe what this step is for'
      });
      return;
    }

    setIsGenerating(true);

    try {
      const previousStep = insertAfterIndex >= 0 ? selectedFlow.steps[insertAfterIndex] : null;
      const nextStep = insertAfterIndex < selectedFlow.steps.length - 1 ? selectedFlow.steps[insertAfterIndex + 1] : null;

      const response = await fetch("/api/generate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepPurpose: stepPurpose.trim(),
          flowContext: flowContext,
          previousStep,
          nextStep
        })
      });

      const data = await response.json();

      if (data.yourMessage) {
        const newStep: FlowStep = {
          id: "step-" + Date.now(),
          yourMessage: data.yourMessage,
          responses: data.responses || [],
          tag: {
            label: `step-${insertAfterIndex + 2}`,
            color: "#3B82F6"
          }
        };

        const newSteps = [...selectedFlow.steps];
        newSteps.splice(insertAfterIndex + 1, 0, newStep);

        // Renumber all steps with correct colors
        const renumberedSteps = renumberSteps(newSteps);

        const updatedFlow = {
          ...selectedFlow,
          steps: renumberedSteps,
          updatedAt: new Date().toISOString()
        };

        setSelectedFlow(updatedFlow);

        const updatedFlows = flows.map(f =>
          f.id === selectedFlow.id ? updatedFlow : f
        );
        setFlows(updatedFlows);
        saveFlows(updatedFlows);

        setStepPurpose("");
        setShowStepDialog(false);
        setInsertAfterIndex(-1);
      } else {
        setModal({
          isOpen: true,
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate step. Please try again.'
        });
      }
    } catch (error) {
      console.error("Error generating step:", error);
      setModal({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: 'Error generating step. Please try again.'
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function saveManualStep() {
    if (!selectedFlow || !manualStep.yourMessage.trim()) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Missing Information',
        message: 'Please enter a message for this step'
      });
      return;
    }

    let updatedSteps: FlowStep[];

    if (editingStepIndex >= 0) {
      // Editing existing step
      updatedSteps = [...selectedFlow.steps];
      updatedSteps[editingStepIndex] = manualStep;
    } else if (insertAfterIndex >= 0) {
      // Inserting step after a specific position
      updatedSteps = [...selectedFlow.steps];
      updatedSteps.splice(insertAfterIndex + 1, 0, manualStep);
    } else {
      // Adding new step at end
      updatedSteps = [...selectedFlow.steps, manualStep];
    }

    const coloredSteps = assignStepColors(updatedSteps);

    const updatedFlow = {
      ...selectedFlow,
      steps: coloredSteps,
      updatedAt: new Date().toISOString()
    };

    setSelectedFlow(updatedFlow);

    const updatedFlows = flows.map(f =>
      f.id === selectedFlow.id ? updatedFlow : f
    );
    setFlows(updatedFlows);
    saveFlows(updatedFlows);

    setShowManualStepDialog(false);
    setManualStep({ id: '', yourMessage: '', responses: [], dripSequence: [] });
    setEditingStepIndex(-1);
    setInsertAfterIndex(-1);
  }

  function deleteStep(stepId: string) {
    if (!selectedFlow) return;
    if (selectedFlow.steps.length <= 1) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Cannot Delete',
        message: 'Flow must have at least one step'
      });
      return;
    }

    const filteredSteps = selectedFlow.steps.filter(s => s.id !== stepId);
    const renumberedSteps = renumberSteps(filteredSteps);

    const updatedFlow = {
      ...selectedFlow,
      steps: renumberedSteps,
      updatedAt: new Date().toISOString()
    };

    setSelectedFlow(updatedFlow);

    const updatedFlows = flows.map(f =>
      f.id === selectedFlow.id ? updatedFlow : f
    );
    setFlows(updatedFlows);
    saveFlows(updatedFlows);
  }

  function toggleStepExpansion(stepId: string) {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  }

  // Helper function to check if a time is within business hours (9 AM - 6 PM)
  function isBusinessHours(date: Date): boolean {
    const hours = date.getHours();
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Not on weekends
    if (day === 0 || day === 6) return false;

    // Between 9 AM and 6 PM
    return hours >= 9 && hours < 18;
  }

  // Helper function to get next business hour time
  function getNextBusinessHour(from: Date): Date {
    const next = new Date(from);

    // If already in business hours, return as is
    if (isBusinessHours(next)) return next;

    // If before 9 AM, set to 9 AM same day
    if (next.getHours() < 9) {
      next.setHours(9, 0, 0, 0);
      if (isBusinessHours(next)) return next;
    }

    // If after 6 PM or weekend, move to next business day at 9 AM
    do {
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    } while (!isBusinessHours(next));

    return next;
  }

  // Format timestamp for display
  function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function startTestFlow() {
    if (!selectedFlow || !selectedFlow.steps || selectedFlow.steps.length === 0) {
      setModal({
        isOpen: true,
        type: 'warning',
        title: 'Cannot Test',
        message: 'No steps in flow to test'
      });
      return;
    }

    const now = new Date();
    setShowTestFlow(true);
    setCurrentStepIndex(0);
    setSimulatedTime(now);
    setLastMessageTime(now);

    // Initialize drip sequence for first step
    const firstStep = selectedFlow.steps[0];
    const initialDrips: Array<{message: string, scheduledFor: Date}> = [];

    if (firstStep.dripSequence && firstStep.dripSequence.length > 0) {
      firstStep.dripSequence.forEach(drip => {
        const scheduledTime = new Date(now.getTime() + drip.delayHours * 60 * 60 * 1000);
        const businessHourTime = getNextBusinessHour(scheduledTime);
        initialDrips.push({
          message: drip.message,
          scheduledFor: businessHourTime
        });
      });
    }

    setPendingDrips(initialDrips);
    setTestMessages([
      { role: 'agent', text: firstStep.yourMessage, timestamp: formatTimestamp(now) }
    ]);
    setTestInput("");
  }

  function resetTestFlow() {
    setShowTestFlow(false);
    setTestMessages([]);
    setCurrentStepIndex(0);
    setTestInput("");
    setSimulatedTime(new Date());
    setLastMessageTime(null);
    setPendingDrips([]);
    setCollectedInfo({});
  }

  // Advance simulated time and trigger any pending drips
  function advanceTime(hours: number) {
    const newTime = new Date(simulatedTime.getTime() + hours * 60 * 60 * 1000);
    setSimulatedTime(newTime);

    // Check if any drips should be sent
    const dripsToSend = pendingDrips.filter(drip => drip.scheduledFor <= newTime);
    const remainingDrips = pendingDrips.filter(drip => drip.scheduledFor > newTime);

    if (dripsToSend.length > 0) {
      const newMessages = dripsToSend.map(drip => ({
        role: 'agent' as const,
        text: drip.message,
        timestamp: formatTimestamp(drip.scheduledFor)
      }));

      setTestMessages(prev => [...prev, ...newMessages]);
      setLastMessageTime(newTime);
    }

    setPendingDrips(remainingDrips);
  }

  async function sendTestMessage() {
    if (!testInput.trim() || !selectedFlow) return;

    const userMessage = testInput.trim();
    const now = simulatedTime;

    // User responded, so clear any pending drip messages
    setPendingDrips([]);

    setTestMessages(prev => [...prev, { role: 'user', text: userMessage, timestamp: formatTimestamp(now) }]);
    setTestInput("");
    setIsTestingAI(true);
    setLastMessageTime(now);

    try {
      // Get current step
      const currentStep = selectedFlow.steps[currentStepIndex];

      // Get conversation history for context
      const conversationHistory = testMessages.map(m =>
        `${m.role === 'agent' ? 'Agent' : (m.role === 'user' ? 'User' : 'System')}: ${m.text}`
      ).join('\n');

      // Send to AI to classify response and get next message
      const response = await fetch("/api/test-flow-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage,
          currentStep,
          allSteps: selectedFlow.steps,
          conversationHistory,
          collectedInfo,
          requiredQuestions: selectedFlow.requiredQuestions || [],
          requiresCall: selectedFlow.requiresCall || false,
          availableSlots: availableSlots
        })
      });

      const data = await response.json();

      if (data.agentResponse) {
        setTestMessages(prev => [...prev, { role: 'agent', text: data.agentResponse, timestamp: formatTimestamp(now) }]);

        // Update collected info if AI extracted new information
        if (data.extractedInfo && Object.keys(data.extractedInfo).length > 0) {
          setCollectedInfo(prev => ({ ...prev, ...data.extractedInfo }));
        }

        // Store available slots if returned
        if (data.availableSlots && data.availableSlots.length > 0) {
          setAvailableSlots(data.availableSlots);
        }

        // Show appointment confirmation if booked
        if (data.appointmentBooked && data.appointmentInfo) {
          setTestMessages(prev => [...prev, {
            role: 'system',
            text: `✅ Appointment booked for ${data.appointmentInfo.time}`,
            timestamp: formatTimestamp(now)
          }]);
        }

        // Create real calendar appointment if enabled and AI mentions booking/scheduling
        if (enableCalendarAppointments && data.agentResponse) {
          const appointmentKeywords = ['booked', 'scheduled', 'appointment set', 'meeting confirmed', 'calendar invite'];
          const hasAppointment = appointmentKeywords.some(keyword =>
            data.agentResponse.toLowerCase().includes(keyword)
          );

          if (hasAppointment) {
            // Extract date and time from AI response
            let extractedDate = 'Tomorrow';
            let extractedTime = '2:00 PM';

            const response = data.agentResponse.toLowerCase();

            // Try to extract date
            if (response.includes('today')) {
              extractedDate = 'Today';
            } else if (response.includes('tomorrow')) {
              extractedDate = 'Tomorrow';
            } else if (response.includes('monday')) {
              extractedDate = 'Monday';
            } else if (response.includes('tuesday')) {
              extractedDate = 'Tuesday';
            } else if (response.includes('wednesday')) {
              extractedDate = 'Wednesday';
            } else if (response.includes('thursday')) {
              extractedDate = 'Thursday';
            } else if (response.includes('friday')) {
              extractedDate = 'Friday';
            }

            // Try to extract time (look for patterns like "5 PM", "3:30 PM", "at 5", etc.)
            const timeMatch = response.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)/);
            if (timeMatch) {
              const hour = timeMatch[1];
              const minutes = timeMatch[2] || '00';
              const period = timeMatch[3].toUpperCase();
              extractedTime = `${hour}:${minutes} ${period}`;
            } else {
              // Try simpler pattern like "at 5" or "at 3:30"
              const simpleMatch = response.match(/at\s+(\d{1,2})(?::(\d{2}))?/);
              if (simpleMatch) {
                const hour = parseInt(simpleMatch[1]);
                const minutes = simpleMatch[2] || '00';
                // Assume PM for business hours (9-6), AM otherwise
                const period = (hour >= 9 && hour <= 11) || hour <= 6 ? 'PM' : 'AM';
                extractedTime = `${hour}:${minutes} ${period}`;
              }
            }

            // Override with extracted info if available
            if (data.extractedInfo?.date) extractedDate = data.extractedInfo.date;
            if (data.extractedInfo?.time) extractedTime = data.extractedInfo.time;

            // Convert to ISO datetime format for Google Calendar API
            const appointmentDateTime = parseAppointmentDateTime(extractedDate, extractedTime);

            // Build description from collected info
            let description = `Flow: ${selectedFlow.name}\n\nCollected Information:\n`;
            Object.entries(collectedInfo).forEach(([key, value]) => {
              description += `${key}: ${value}\n`;
            });
            description += `\nConversation History:\n`;
            testMessages.forEach((msg) => {
              description += `${msg.role === 'user' ? 'User' : (msg.role === 'agent' ? 'Agent' : 'System')}: ${msg.text}\n`;
            });

            // Create the appointment via API
            try {
              const createResponse = await fetch('/api/calendar/create-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  summary: selectedFlow.name,
                  description: description,
                  start: appointmentDateTime.start,
                  end: appointmentDateTime.end,
                  attendeeEmail: collectedInfo.email || undefined,
                  attendeeName: collectedInfo.name || 'Test Lead',
                  leadId: null // Test mode, no real lead
                })
              });

              const createData = await createResponse.json();

              if (createData.success) {
                const newAppointment = {
                  title: selectedFlow.name,
                  date: extractedDate,
                  time: extractedTime,
                  eventId: createData.eventId,
                  htmlLink: createData.htmlLink
                };

                setCreatedAppointments(prev => [...prev, newAppointment]);

                // Add a system message showing the appointment was created
                setTestMessages(prev => [...prev, {
                  role: 'system',
                  text: `📅 Calendar Appointment Created!\n\nTitle: ${newAppointment.title}\nDate: ${newAppointment.date}\nTime: ${newAppointment.time}\n\nView in Google Calendar: ${createData.htmlLink || 'Check your calendar'}`,
                  timestamp: formatTimestamp(now)
                }]);
              } else {
                console.error('Failed to create calendar event:', createData.error);
                setTestMessages(prev => [...prev, {
                  role: 'system',
                  text: `⚠️ Failed to create calendar appointment: ${createData.error || 'Unknown error'}`,
                  timestamp: formatTimestamp(now)
                }]);
              }
            } catch (error: any) {
              console.error('Error creating calendar event:', error);
              setTestMessages(prev => [...prev, {
                role: 'system',
                text: `⚠️ Error creating calendar appointment. Make sure Google Calendar is connected.`,
                timestamp: formatTimestamp(now)
              }]);
            }
          }
        }

        // ALWAYS set up drips if AI provided them (for both custom and preset responses)
        if (data.customDrips && data.customDrips.length > 0) {
          const newDrips: Array<{message: string, scheduledFor: Date}> = [];

          data.customDrips.forEach((drip: any) => {
            const scheduledTime = new Date(now.getTime() + drip.delayHours * 60 * 60 * 1000);
            const businessHourTime = getNextBusinessHour(scheduledTime);
            newDrips.push({
              message: drip.message,
              scheduledFor: businessHourTime
            });
          });

          setPendingDrips(newDrips);
        }

        // Update current step if AI determined we should move to next step
        if (data.nextStepIndex !== undefined && data.nextStepIndex !== currentStepIndex) {
          setCurrentStepIndex(data.nextStepIndex);
        }
      } else {
        setTestMessages(prev => [...prev, { role: 'agent', text: "I'm not sure how to respond to that. Let me try another approach...", timestamp: formatTimestamp(now) }]);
      }
    } catch (error) {
      console.error("Error testing flow:", error);
      setTestMessages(prev => [...prev, { role: 'agent', text: "Error processing your response. Please try again.", timestamp: formatTimestamp(now) }]);
    } finally {
      setIsTestingAI(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Conversation Flows</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Create AI-powered conversation flows for your campaigns</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFlowDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 border border-blue-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + AI Flow
          </button>
          <button
            onClick={() => setShowManualFlowDialog(true)}
            className="bg-purple-600 hover:bg-purple-700 border border-purple-500/50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Manual Flow
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && flowToDelete && (
        <div className="fixed inset-0 md:left-64 bg-black/50 flex items-center justify-center z-[9999]" onClick={cancelDeleteFlow}>
          <div className="bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {flowToDelete.isAIGenerated || flowToDelete.is_ai_generated ? 'Delete AI-Generated Flow' : 'Delete Flow'}
                  </h3>
                  <p className="text-sm text-white/60">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-4">
              {(flowToDelete.isAIGenerated || flowToDelete.is_ai_generated) && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium text-red-400">Warning: This is an AI-generated flow</p>
                  <p className="text-sm text-white/70">
                    Deleting it will <span className="font-semibold text-white">NOT refund your points</span>.
                    The points used to create this flow are non-refundable.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm text-white/90">
                  Are you sure you want to delete <span className="font-semibold text-white">"{flowToDelete.name}"</span>?
                </p>
                <p className="text-sm text-white/60">
                  All steps and configurations will be permanently removed.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-white/5 border-t border-white/10 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={cancelDeleteFlow}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFlow}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 border border-red-500/50 transition-colors"
              >
                Delete Flow
              </button>
            </div>
          </div>
        </div>
      )}

      {showStepDialog && (
        <div className="fixed inset-0 md:left-64 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="card max-w-lg w-full mx-4">
            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold text-white">Generate New Step with AI</div>
                <div className="text-sm text-[var(--muted)] mt-1">
                  Describe what this step should accomplish (1 point)
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">Step Purpose *</label>
                <textarea
                  placeholder="e.g., 'Ask about their budget range', 'Handle price objection', 'Qualify timeline'"
                  value={stepPurpose}
                  onChange={e => setStepPurpose(e.target.value)}
                  className="input-dark w-full px-4 py-3 rounded-lg resize-none"
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Be specific about what this step should ask or accomplish
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={generateAndInsertStep}
                  className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isGenerating || !stepPurpose.trim()}
                >
                  {isGenerating ? "Generating Step..." : "Generate Step (1 pt)"}
                </button>
                <button
                  onClick={() => {
                    setShowStepDialog(false);
                    setStepPurpose("");
                    setInsertAfterIndex(-1);
                  }}
                  className="bg-white/10 px-6 py-3 rounded-lg text-white hover:bg-white/20"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewFlowDialog && (
        <div className="fixed inset-0 md:left-64 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#1a1f2e] border-2 border-white/30 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">Create New Flow with AI</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Tell us about your outreach so AI can generate a customized conversation flow
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowNewFlowDialog(false);
                    setNewFlowName("");
                    setFlowContext({ whoYouAre: "", whatOffering: "", whoTexting: "", clientGoals: "" });
                    setRequiredQuestions([]);
                    setRequiresCall(false);
                  }}
                  className="text-white/60 hover:text-white text-2xl leading-none"
                  disabled={isGenerating}
                >
                  ×
                </button>
              </div>

            <div>
              <label className="text-sm font-medium text-white mb-2 block">Flow Name *</label>
              <input
                type="text"
                placeholder="e.g., 'Lead Qualification', 'IUL Sales Outreach', 'Solar Leads'"
                value={newFlowName}
                onChange={e => setNewFlowName(e.target.value)}
                className="input-dark w-full px-4 py-3 rounded-lg"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-white mb-2 block">Who are you? *</label>
                <input
                  type="text"
                  placeholder="e.g., 'Insurance agent', 'Real estate broker'"
                  value={flowContext.whoYouAre}
                  onChange={e => setFlowContext({...flowContext, whoYouAre: e.target.value})}
                  className="input-dark w-full px-4 py-3 rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">Who are you texting? *</label>
                <input
                  type="text"
                  placeholder="e.g., 'Homeowners 40-65', 'Small business owners'"
                  value={flowContext.whoTexting}
                  onChange={e => setFlowContext({...flowContext, whoTexting: e.target.value})}
                  className="input-dark w-full px-4 py-3 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-white mb-2 block">What are you offering? *</label>
              <textarea
                placeholder="e.g., 'Free IUL policy review with no obligation. We help families protect their future with indexed universal life insurance that builds cash value.'"
                value={flowContext.whatOffering}
                onChange={e => setFlowContext({...flowContext, whatOffering: e.target.value})}
                className="input-dark w-full px-4 py-3 rounded-lg resize-none"
                rows={3}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <label className="text-sm font-medium text-white block">Required Questions *</label>
                  <p className="text-xs text-[var(--muted)] mt-1">Specific information the AI must collect from every client</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRequiredQuestions([...requiredQuestions, { question: '', fieldName: '' }])}
                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
                >
                  <span className="text-lg leading-none">+</span> Add Question
                </button>
              </div>

              <div className="space-y-3">
                {requiredQuestions.map((q, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Question (e.g., What's your household income?)"
                        value={q.question}
                        onChange={e => {
                          const updated = [...requiredQuestions];
                          updated[idx].question = e.target.value;
                          updated[idx].fieldName = generateFieldName(e.target.value);
                          setRequiredQuestions(updated);
                        }}
                        className="input-dark px-3 py-2 rounded-lg text-sm w-full"
                      />
                      {q.fieldName && (
                        <div className="text-xs text-[var(--muted)] mt-1 px-1">
                          Field name: {q.fieldName}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRequiredQuestions(requiredQuestions.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 text-xl leading-none px-2 py-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {requiredQuestions.length === 0 && (
                  <div className="text-sm text-[var(--muted)] bg-white/5 rounded-lg p-3 text-center">
                    No required questions yet. Click "+ Add Question" to add one.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
              <input
                type="checkbox"
                id="requiresCall"
                checked={requiresCall}
                onChange={(e) => setRequiresCall(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-white/30 bg-white/10 checked:bg-blue-500 checked:border-blue-500 cursor-pointer"
              />
              <label htmlFor="requiresCall" className="text-sm font-medium text-white cursor-pointer flex-1">
                This flow requires a phone call or Zoom meeting with the client
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-white mb-2 block">Client goals (optional)</label>
              <textarea
                placeholder="e.g., 'Protect family income, build retirement savings, leave a legacy, supplement retirement income'"
                value={flowContext.clientGoals}
                onChange={e => setFlowContext({...flowContext, clientGoals: e.target.value})}
                className="input-dark w-full px-4 py-3 rounded-lg resize-none"
                rows={2}
              />
              <p className="text-xs text-[var(--muted)] mt-1">What are your clients typically trying to achieve?</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={createNewFlow}
                className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating || !newFlowName.trim() || !flowContext.whoYouAre || !flowContext.whatOffering || !flowContext.whoTexting}
              >
                {isGenerating ? "Generating Flow..." : "Generate Flow with AI"}
              </button>
              <button
                onClick={() => {
                  setShowNewFlowDialog(false);
                  setNewFlowName("");
                  setFlowContext({ whoYouAre: "", whatOffering: "", whoTexting: "", clientGoals: "" });
                  setRequiredQuestions([]);
                  setRequiresCall(false);
                }}
                className="bg-white/10 px-6 py-3 rounded-lg text-white hover:bg-white/20"
                disabled={isGenerating}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Flow List */}
        <div className="col-span-12 md:col-span-3">
          <div className="border border-white/20 rounded-xl overflow-hidden bg-white/10">
            <div className="bg-white/15 px-3 py-2 text-sm font-medium text-white border-b border-white/20">Your Flows ({flows.length})</div>
            <div className="divide-y divide-white/20">
              {flows.length === 0 && (
                <div className="px-3 py-6 text-sm text-[var(--muted)] text-center">
                  No flows yet.<br/>
                  <span className="text-xs">Click "+ New Flow" to create one.</span>
                </div>
              )}
              {flows.map(flow => (
                <div
                  key={flow.id}
                  className={`p-3 cursor-pointer hover:bg-white/15 ${
                    selectedFlow?.id === flow.id ? 'bg-white/20' : ''
                  } ${
                    flow.isAIGenerated !== false
                      ? 'border-l-4 border-blue-400'
                      : 'border-l-4 border-purple-400'
                  }`}
                  onClick={() => setSelectedFlow(flow)}
                >
                  {editingFlowName && selectedFlow?.id === flow.id ? (
                    <input
                      type="text"
                      value={tempFlowName}
                      onChange={(e) => setTempFlowName(e.target.value)}
                      onBlur={() => {
                        if (tempFlowName.trim()) {
                          const updatedFlow = { ...flow, name: tempFlowName.trim(), updatedAt: new Date().toISOString() };
                          const updatedFlows = flows.map(f => f.id === flow.id ? updatedFlow : f);
                          setFlows(updatedFlows);
                          saveFlows(updatedFlows);
                          setSelectedFlow(updatedFlow);
                        }
                        setEditingFlowName(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          setTempFlowName(flow.name);
                          setEditingFlowName(false);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-sm text-white bg-white/20 border border-white/30 rounded px-2 py-1 w-full focus:outline-none focus:border-blue-400"
                      autoFocus
                    />
                  ) : (
                    <div
                      className="font-medium text-sm text-white flex items-center justify-between group"
                      onClick={(e) => {
                        if (selectedFlow?.id === flow.id) {
                          e.stopPropagation();
                          setTempFlowName(flow.name);
                          setEditingFlowName(true);
                        }
                      }}
                    >
                      <span>{flow.name}</span>
                      {selectedFlow?.id === flow.id && (
                        <span className="text-xs text-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          click to edit
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {flow.steps.length} steps • {flow.isAIGenerated !== false ? 'AI' : 'Manual'}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }}
                    className="text-red-400 text-xs hover:text-red-300 mt-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Flow Editor */}
        <div className="col-span-12 md:col-span-9">
          {!selectedFlow ? (
            <div className="card">
              <div className="text-[var(--muted)]">
                Select a flow on the left or create a new one to get started.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {/* Left sidebar: Rebuttal/Alternate Steps - Only show for AI flows */}
              {selectedFlow.isAIGenerated !== false && (
                <div className="col-span-12 lg:col-span-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                  <div className="sticky top-0 bg-[#0a0a0a] pb-3 z-10 pt-2">
                    <div className="text-sm font-semibold text-amber-400 mb-2">
                      📋 Rebuttal & Alternate Paths
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      How objections/questions flow back to main path
                    </div>
                  </div>

                  {/* Display response flow navigation */}
                  {selectedFlow.steps.map((step, stepIndex) => (
                    <div key={step.id} className="space-y-2">
                      {step.responses && step.responses.length > 0 && (
                        <>
                          <div className="text-xs font-semibold text-amber-300 mt-4 mb-2">
                            Step {stepIndex + 1} Rebuttals
                          </div>
                          {step.responses.map((response, responseIndex) => {
                            const nextStepId = (response as any).nextStepId;
                            const action = (response as any).action;
                            const nextStepIndex = nextStepId
                              ? selectedFlow.steps.findIndex(s => s.id === nextStepId)
                              : -1;

                            return (
                              <div
                                key={responseIndex}
                                className="border border-amber-500/30 rounded-lg p-2.5 bg-amber-500/10"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="text-xs font-bold text-amber-400 flex-1">
                                    {response.label || `Response ${responseIndex + 1}`}
                                  </div>
                                  {action === 'end' ? (
                                    <div className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 whitespace-nowrap">
                                      ⚠️ Ends
                                    </div>
                                  ) : nextStepIndex >= 0 ? (
                                    <div className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400 whitespace-nowrap">
                                      → Step {nextStepIndex + 1}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 whitespace-nowrap">
                                      ↻ Loop
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  ))}

                  {selectedFlow.steps.every(s => !s.responses || s.responses.length === 0) && (
                    <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/10">
                      <div className="text-xs text-amber-300">
                        No response options yet. Expand "Client Response Options" to add rebuttal paths.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Right: Main Flow Steps */}
              <div className={selectedFlow.isAIGenerated !== false ? "col-span-12 lg:col-span-8 space-y-4" : "col-span-12 space-y-4"}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">{selectedFlow.name}</div>
                    <div className="text-sm text-[var(--muted)]">
                      Main flow - optimal path to close
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={startTestFlow}
                      className="bg-green-600 hover:bg-green-700 border border-green-500/50 px-3 py-1.5 rounded text-xs text-white font-medium transition-colors"
                    >
                      Test
                    </button>
                  </div>
                </div>

                {selectedFlow.steps.map((step, stepIndex) => (
                  <div key={step.id}>
                    {/* Main Step Card */}
                <div className="border border-white/10 rounded-xl p-4 bg-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-bold text-white/60">STEP {stepIndex + 1}</div>
                      {step.tag && (
                        <div
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${step.tag.color}20`,
                            color: step.tag.color,
                            border: `1px solid ${step.tag.color}40`
                          }}
                        >
                          {step.tag.label}
                        </div>
                      )}
                    </div>
                    {selectedFlow.steps.length > 1 && (
                      <button
                        onClick={() => deleteStep(step.id)}
                        className="text-red-400 text-xs hover:text-red-300"
                      >
                        Delete Step
                      </button>
                    )}
                  </div>

                  {/* Step Tag Editor */}
                  <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-xs font-medium text-white mb-2">Step Tag (visible to team)</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <input
                          type="text"
                          value={step.tag?.label || ''}
                          onChange={e => updateStep(step.id, {
                            tag: { label: e.target.value, color: step.tag?.color || '#3B82F6' }
                          })}
                          placeholder="e.g., 'Qualification', 'Follow-up'"
                          className="input-dark w-full px-3 py-2 rounded-lg text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'].map(color => (
                          <button
                            key={color}
                            onClick={() => updateStep(step.id, {
                              tag: { label: step.tag?.label || `Step ${stepIndex + 1}`, color }
                            })}
                            className={`w-8 h-8 rounded-lg border-2 ${
                              step.tag?.color === color ? 'border-white' : 'border-white/20'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Your Message */}
                  <div className="mb-4">
                    <div className="text-sm font-medium mb-2 text-green-400">Your Message:</div>
                    <textarea
                      value={step.yourMessage}
                      onChange={e => updateStep(step.id, { yourMessage: e.target.value })}
                      className="input-dark w-full px-4 py-3 rounded-lg min-h-[100px]"
                      placeholder="Type your message here..."
                    />
                  </div>

                  {/* 4 Response Options - Collapsible */}
                  <div>
                    <button
                      onClick={() => toggleStepExpansion(step.id)}
                      className="w-full flex items-center justify-between text-sm font-medium mb-3 text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <span>Client Response Options ({step.responses.length})</span>
                      <svg
                        className={`w-5 h-5 transition-transform ${expandedSteps.has(step.id) ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {expandedSteps.has(step.id) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {step.responses.map((response, responseIndex) => (
                          <div key={responseIndex} className="border border-blue-500/30 rounded-lg p-3 bg-blue-500/10">
                            <div className="text-xs font-bold mb-2 text-blue-300">Response {responseIndex + 1}</div>

                            <input
                              type="text"
                              value={response.label}
                              onChange={e => updateResponse(step.id, responseIndex, { label: e.target.value })}
                              className="input-dark w-full px-3 py-2 rounded-lg text-sm mb-2"
                              placeholder="Label (e.g., 'Interested')"
                            />

                            <div className="text-xs text-[var(--muted)] mb-1">Your reply if they say this:</div>
                            <textarea
                              value={response.followUpMessage}
                              onChange={e => updateResponse(step.id, responseIndex, { followUpMessage: e.target.value })}
                              className="input-dark w-full px-3 py-2 rounded-lg text-sm min-h-[70px]"
                              placeholder="Your follow-up message..."
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                    {/* Insert Step Button - show after each step */}
                    <div className="flex justify-center my-2">
                      <button
                        onClick={() => insertStepAfter(stepIndex)}
                        className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-400 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Insert Step Here
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test Flow Chat Modal */}
      {showTestFlow && (
        <div className="fixed inset-0 md:left-64 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="card max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
              <div>
                <div className="text-lg font-semibold text-white">🧪 Test Flow: {selectedFlow?.name}</div>
                <div className="text-sm text-[var(--muted)] mt-1">
                  You are the client - respond naturally to test your flow
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableCalendarAppointments}
                      onChange={(e) => setEnableCalendarAppointments(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800 cursor-pointer"
                    />
                    <span className="text-sm text-white">📅 Enable Calendar Appointments</span>
                  </label>
                </div>
              </div>
              <button
                onClick={resetTestFlow}
                className="text-red-400 hover:text-red-300 text-sm font-medium"
              >
                Close
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[300px] max-h-[400px]">
              {testMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : message.role === 'system'
                        ? 'bg-yellow-500/20 border border-yellow-500/50 text-yellow-100'
                        : 'bg-green-500/20 border border-green-500/50 text-green-100'
                    }`}
                  >
                    <div className="text-xs font-semibold mb-1 opacity-70 flex items-center justify-between">
                      <span>{message.role === 'user' ? 'You (Client)' : message.role === 'system' ? 'System' : 'Agent'}</span>
                      {message.timestamp && <span className="ml-2 font-normal opacity-50">{message.timestamp}</span>}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{message.text}</div>
                  </div>
                </div>
              ))}
              {isTestingAI && (
                <div className="flex justify-start">
                  <div className="bg-green-500/20 border border-green-500/50 text-green-100 px-4 py-3 rounded-lg">
                    <div className="text-xs font-semibold mb-1 opacity-70">Agent</div>
                    <div className="text-sm">Thinking...</div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="flex gap-2 pt-4 border-t border-white/10">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isTestingAI && testInput.trim()) {
                    sendTestMessage();
                  }
                }}
                disabled={isTestingAI}
                placeholder="Type your response as the client..."
                className="input-dark flex-1 px-4 py-3 rounded-lg text-sm"
              />
              <button
                onClick={sendTestMessage}
                disabled={isTestingAI || !testInput.trim()}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium text-sm"
              >
                {isTestingAI ? 'Sending...' : 'Send'}
              </button>
            </div>

            {/* Time Controls & Drip Visualization */}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
              {/* Time Display and Controls */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--muted)]">
                  <span className="mr-3">⏰ Current Time: <span className="text-white font-semibold">{simulatedTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span></span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => advanceTime(3)}
                    className="bg-purple-500/20 border border-purple-500/50 text-purple-200 hover:bg-purple-500/30 px-3 py-1 rounded text-xs font-medium"
                  >
                    +3 hours
                  </button>
                  <button
                    onClick={() => advanceTime(24)}
                    className="bg-purple-500/20 border border-purple-500/50 text-purple-200 hover:bg-purple-500/30 px-3 py-1 rounded text-xs font-medium"
                  >
                    +1 day
                  </button>
                  <button
                    onClick={() => advanceTime(48)}
                    className="bg-purple-500/20 border border-purple-500/50 text-purple-200 hover:bg-purple-500/30 px-3 py-1 rounded text-xs font-medium"
                  >
                    +2 days
                  </button>
                </div>
              </div>

              {/* Pending Drips Display */}
              {pendingDrips.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                  <div className="text-xs font-semibold text-orange-200 mb-2">📬 Scheduled Follow-ups ({pendingDrips.length})</div>
                  <div className="space-y-1">
                    {pendingDrips.map((drip, idx) => (
                      <div key={idx} className="text-xs text-orange-100/70">
                        • {drip.scheduledFor.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}: "{drip.message.substring(0, 50)}{drip.message.length > 50 ? '...' : ''}"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calendar Appointments */}
              {enableCalendarAppointments && createdAppointments.length > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <div className="text-xs font-semibold text-purple-200 mb-2">📅 Calendar Appointments Created ({createdAppointments.length})</div>
                  <div className="space-y-1">
                    {createdAppointments.map((appt, idx) => (
                      <div key={idx} className="text-xs text-purple-100/70">
                        • <span className="font-medium text-purple-200">{appt.title}</span> - {appt.date} at {appt.time}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collected Client Information */}
              {Object.keys(collectedInfo).length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <div className="text-xs font-semibold text-blue-200 mb-2">📋 Collected Client Information</div>
                  <div className="space-y-1">
                    {Object.entries(collectedInfo).map(([key, value]) => (
                      <div key={key} className="text-xs text-blue-100/70">
                        <span className="font-medium text-blue-200">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Step Indicator */}
              {selectedFlow && selectedFlow.steps[currentStepIndex] && (
                <div className="text-xs text-[var(--muted)]">
                  Current Step: <span className="text-white font-semibold">Step {currentStepIndex + 1}</span>
                  {selectedFlow.steps[currentStepIndex].tag && (
                    <span
                      className="ml-2 px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${selectedFlow.steps[currentStepIndex].tag.color}20`,
                        color: selectedFlow.steps[currentStepIndex].tag.color,
                        border: `1px solid ${selectedFlow.steps[currentStepIndex].tag.color}40`
                      }}
                    >
                      {selectedFlow.steps[currentStepIndex].tag.label}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Flow Creation Dialog */}
      {showManualFlowDialog && (
        <div className="fixed inset-0 md:left-64 bg-black/70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-[#1a1f2e] border-2 border-white/30 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">Create New Manual Flow</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Create a flow with your first message step
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowManualFlowDialog(false);
                    setManualFlowName("");
                    setManualFlowMessage("");
                  }}
                  className="text-white/60 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">Flow Name *</label>
                <input
                  type="text"
                  placeholder="e.g., 'Welcome Sequence', 'Follow-up Flow'"
                  value={manualFlowName}
                  onChange={e => setManualFlowName(e.target.value)}
                  className="input-dark w-full px-4 py-3 rounded-lg"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">
                  {manualFlowSteps.length === 0 ? 'First Message *' : 'Next Message *'}
                </label>
                <textarea
                  placeholder="Enter message to the client..."
                  value={manualFlowMessage}
                  onChange={e => setManualFlowMessage(e.target.value)}
                  className="input-dark w-full px-4 py-3 rounded-lg resize-none"
                  rows={4}
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  {manualFlowSteps.length === 0
                    ? 'This will be the first message sent in your flow'
                    : `This will be step ${manualFlowSteps.length + 1} in your flow`
                  }
                </p>
              </div>

              {manualFlowSteps.length > 0 && (
                <div className="border border-white/20 rounded-lg p-3">
                  <div className="text-sm font-medium text-white mb-2">Steps Added ({manualFlowSteps.length})</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {manualFlowSteps.map((step, index) => (
                      <div key={index} className="flex items-start gap-2 text-sm bg-white/5 p-2 rounded">
                        <span className="text-white/60 font-medium">{index + 1}.</span>
                        <span className="text-white/80 flex-1 line-clamp-2">{step}</span>
                        <button
                          onClick={() => {
                            const updatedSteps = manualFlowSteps.filter((_, i) => i !== index);
                            setManualFlowSteps(updatedSteps);
                          }}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    if (!manualFlowMessage.trim()) {
                      setModal({
                        isOpen: true,
                        type: 'warning',
                        title: 'Missing Information',
                        message: 'Please enter a message'
                      });
                      return;
                    }

                    // Add step to the list
                    setManualFlowSteps([...manualFlowSteps, manualFlowMessage]);
                    setManualFlowMessage("");
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
                  disabled={!manualFlowMessage.trim()}
                >
                  + Add Another Step
                </button>
                <button
                  onClick={() => {
                    if (!manualFlowName.trim()) {
                      setModal({
                        isOpen: true,
                        type: 'warning',
                        title: 'Missing Information',
                        message: 'Please enter a flow name'
                      });
                      return;
                    }

                    if (manualFlowSteps.length === 0 && !manualFlowMessage.trim()) {
                      setModal({
                        isOpen: true,
                        type: 'warning',
                        title: 'Missing Information',
                        message: 'Please add at least one step'
                      });
                      return;
                    }

                    const flowId = `flow-${Date.now()}`;

                    // Collect all steps (existing steps + current message if any)
                    const allStepMessages = [...manualFlowSteps];
                    if (manualFlowMessage.trim()) {
                      allStepMessages.push(manualFlowMessage);
                    }

                    // Create FlowStep objects
                    const steps: FlowStep[] = allStepMessages.map((msg, index) => ({
                      id: `step-${Date.now()}-${index}`,
                      yourMessage: msg,
                      responses: [],
                      dripSequence: []
                    }));

                    const newFlow: ConversationFlow = {
                      id: flowId,
                      name: manualFlowName,
                      steps: steps,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      isAIGenerated: false
                    };

                    const updatedFlows = [...flows, newFlow];
                    setFlows(updatedFlows);
                    saveFlows(updatedFlows);
                    setSelectedFlow(newFlow);

                    setShowManualFlowDialog(false);
                    setManualFlowName("");
                    setManualFlowMessage("");
                    setManualFlowSteps([]);
                  }}
                  className="bg-purple-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50"
                  disabled={!manualFlowName.trim() || (manualFlowSteps.length === 0 && !manualFlowMessage.trim())}
                >
                  Create Flow
                </button>
                <button
                  onClick={() => {
                    setShowManualFlowDialog(false);
                    setManualFlowName("");
                    setManualFlowMessage("");
                    setManualFlowSteps([]);
                  }}
                  className="bg-white/10 px-6 py-3 rounded-lg text-white hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Step Editor Dialog */}
      {showManualStepDialog && (
        <div className="fixed inset-0 md:left-64 bg-black/70 flex items-center justify-center z-[9999] p-4 overflow-y-auto">
          <div className="bg-[#1a1f2e] border-2 border-white/30 rounded-xl p-6 max-w-2xl w-full my-8 shadow-2xl">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">
                    {editingStepIndex >= 0 ? 'Edit Manual Step' : 'Add Manual Step'}
                  </div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Create a custom message step for your flow
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowManualStepDialog(false);
                    setManualStep({ id: '', yourMessage: '', responses: [], dripSequence: [] });
                    setEditingStepIndex(-1);
                    setInsertAfterIndex(-1);
                  }}
                  className="text-white/60 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">Your Message *</label>
                <textarea
                  placeholder="Enter the message you want to send..."
                  value={manualStep.yourMessage}
                  onChange={e => setManualStep({...manualStep, yourMessage: e.target.value})}
                  className="input-dark w-full px-4 py-3 rounded-lg resize-none"
                  rows={3}
                  autoFocus
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  This message will be sent to the client at this step
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveManualStep}
                  className="bg-purple-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50"
                  disabled={!manualStep.yourMessage.trim()}
                >
                  {editingStepIndex >= 0 ? 'Update Step' : 'Add Step'}
                </button>
                <button
                  onClick={() => {
                    setShowManualStepDialog(false);
                    setManualStep({ id: '', yourMessage: '', responses: [], dripSequence: [] });
                    setEditingStepIndex(-1);
                    setInsertAfterIndex(-1);
                  }}
                  className="bg-white/10 px-6 py-3 rounded-lg text-white hover:bg-white/20"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Flow Generation Loading Modal */}
      {isGenerating && (
        <div className="fixed inset-0 md:left-64 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999]">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-purple-500/20">
            <div className="text-center">
              {/* Animated AI Icon */}
              <div className="mb-6 relative">
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center animate-pulse shadow-lg shadow-purple-500/50">
                  <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                {/* Orbiting dots */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 animate-spin-slow">
                    <div className="absolute top-0 left-1/2 -ml-1 w-2 h-2 bg-purple-400 rounded-full"></div>
                    <div className="absolute bottom-0 left-1/2 -ml-1 w-2 h-2 bg-blue-400 rounded-full"></div>
                    <div className="absolute left-0 top-1/2 -mt-1 w-2 h-2 bg-pink-400 rounded-full"></div>
                    <div className="absolute right-0 top-1/2 -mt-1 w-2 h-2 bg-cyan-400 rounded-full"></div>
                  </div>
                </div>
              </div>

              {/* Text */}
              <h3 className="text-2xl font-bold text-white mb-2">
                Generating Your Flow
              </h3>
              <p className="text-gray-300 mb-4">
                Our AI is crafting a personalized conversation flow...
              </p>

              {/* Progress indicators */}
              <div className="space-y-2 text-left">
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                  <span>Analyzing your business context</span>
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <span>Building conversation steps</span>
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" style={{animationDelay: '0.4s'}}></div>
                  <span>Optimizing response paths</span>
                </div>
              </div>

              {/* Loading bar */}
              <div className="mt-6 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 animate-shimmer bg-[length:200%_100%]"></div>
              </div>

              <p className="text-xs text-gray-500 mt-4">
                This usually takes 10-20 seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modal */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        type={modal.type}
        title={modal.title}
        message={modal.message}
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import type { CalendarEvent, CreateCalendarEventRequest } from "@rfpinator/shared";

interface CalendarViewProps {
  // Add any props needed from parent component
}

export function CalendarView({}: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  // Get current month/year for display
  const currentMonth = selectedDate.getMonth();
  const currentYear = selectedDate.getFullYear();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Generate calendar days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const firstDayWeekday = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const calendarDays = [];
  
  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDayWeekday; i++) {
    calendarDays.push(null);
  }
  
  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // Load events on mount and when month changes
  useEffect(() => {
    loadEvents();
  }, [currentMonth, currentYear]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/calendar/events?month=${currentMonth}&year=${currentYear}`);
      // const data = await response.json();
      // setEvents(data.events);
      
      // Mock data for now
      setEvents([
        {
          id: "1",
          title: "RFP Submission Deadline",
          description: "Final deadline for ABC Corp RFP",
          startDate: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-15`,
          type: "rfp_deadline",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "2",
          title: "Evaluation Review Meeting",
          description: "Review evaluation results with team",
          startDate: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-22`,
          startTime: "14:00",
          endTime: "15:30",
          type: "meeting",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Failed to load calendar events:", error);
    } finally {
      setLoading(false);
    }
  };

  const getEventsForDate = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(event => event.startDate === dateStr);
  };

  const handlePrevMonth = () => {
    setSelectedDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleCreateEvent = () => {
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const getEventTypeColor = (type: CalendarEvent["type"]) => {
    switch (type) {
      case "rfp_deadline":
        return "bg-red-100 text-red-800 border-red-200";
      case "evaluation":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "meeting":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading calendar...</div>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600">Manage RFP deadlines and evaluation schedules</p>
        </div>
        <button
          onClick={handleCreateEvent}
          className="btn-primary"
        >
          + Add Event
        </button>
      </div>

      {/* Calendar Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          ← Previous
        </button>
        
        <h2 className="text-xl font-semibold text-gray-900">
          {monthNames[currentMonth]} {currentYear}
        </h2>
        
        <button
          onClick={handleNextMonth}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Next →
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 bg-white rounded-lg border border-surface-border overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-surface-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="p-3 text-center text-sm font-medium text-gray-500 bg-gray-50">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 h-full">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={index} className="border-r border-b border-surface-border bg-gray-50"></div>;
            }

            const dayEvents = getEventsForDate(day);
            const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, day).toDateString();

            return (
              <div
                key={day}
                className="border-r border-b border-surface-border p-2 min-h-[120px] hover:bg-gray-50"
              >
                <div className={`text-sm font-medium mb-2 ${isToday ? 'text-brand-600' : 'text-gray-900'}`}>
                  {day}
                </div>
                
                <div className="space-y-1">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => handleEditEvent(event)}
                      className={`text-xs p-1 rounded border cursor-pointer hover:shadow-sm ${getEventTypeColor(event.type)}`}
                    >
                      <div className="font-medium truncate">{event.title}</div>
                      {event.startTime && (
                        <div className="opacity-75">{event.startTime}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Modal - Simple placeholder for now */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingEvent ? "Edit Event" : "Create Event"}
            </h3>
            <p className="text-gray-600 mb-4">
              Event creation/editing form would go here.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowEventModal(false)}
                className="btn-primary"
              >
                {editingEvent ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
} from "@rfpinator/shared";

interface GetEventsFilter {
  month?: number;
  year?: number;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  
  // In-memory storage for now - in production, this would use a database
  private events: CalendarEvent[] = [];
  private nextId = 1;

  async getEvents(filter: GetEventsFilter = {}): Promise<CalendarEvent[]> {
    let filteredEvents = [...this.events];

    if (filter.month !== undefined && filter.year !== undefined) {
      filteredEvents = filteredEvents.filter((event) => {
        const eventDate = new Date(event.startDate);
        return (
          eventDate.getMonth() === filter.month &&
          eventDate.getFullYear() === filter.year
        );
      });
    }

    return filteredEvents.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  async getEvent(id: string): Promise<CalendarEvent> {
    const event = this.events.find((e) => e.id === id);
    if (!event) {
      throw new NotFoundException(`Calendar event with ID ${id} not found`);
    }
    return event;
  }

  async createEvent(request: CreateCalendarEventRequest): Promise<CalendarEvent> {
    const now = new Date().toISOString();
    const event: CalendarEvent = {
      id: String(this.nextId++),
      ...request,
      createdAt: now,
      updatedAt: now,
    };

    this.events.push(event);
    this.logger.log(`Created calendar event: ${event.title} (${event.id})`);
    
    return event;
  }

  async updateEvent(request: UpdateCalendarEventRequest): Promise<CalendarEvent> {
    const eventIndex = this.events.findIndex((e) => e.id === request.id);
    if (eventIndex === -1) {
      throw new NotFoundException(`Calendar event with ID ${request.id} not found`);
    }

    const existingEvent = this.events[eventIndex];
    const updatedEvent: CalendarEvent = {
      ...existingEvent,
      ...request,
      updatedAt: new Date().toISOString(),
    };

    this.events[eventIndex] = updatedEvent;
    this.logger.log(`Updated calendar event: ${updatedEvent.title} (${updatedEvent.id})`);
    
    return updatedEvent;
  }

  async deleteEvent(id: string): Promise<void> {
    const eventIndex = this.events.findIndex((e) => e.id === id);
    if (eventIndex === -1) {
      throw new NotFoundException(`Calendar event with ID ${id} not found`);
    }

    const deletedEvent = this.events.splice(eventIndex, 1)[0];
    this.logger.log(`Deleted calendar event: ${deletedEvent.title} (${id})`);
  }

  /**
   * Create an RFP deadline event automatically when an RFP is processed
   */
  async createRfpDeadlineEvent(
    rfpTitle: string,
    deadlineDate: string,
    rfpId?: string,
  ): Promise<CalendarEvent> {
    return this.createEvent({
      title: `RFP Deadline: ${rfpTitle}`,
      description: `Submission deadline for ${rfpTitle}`,
      startDate: deadlineDate,
      type: "rfp_deadline",
      relatedId: rfpId,
    });
  }

  /**
   * Create an evaluation event automatically when an evaluation is scheduled
   */
  async createEvaluationEvent(
    evaluationTitle: string,
    evaluationDate: string,
    evaluationId?: string,
  ): Promise<CalendarEvent> {
    return this.createEvent({
      title: `Evaluation: ${evaluationTitle}`,
      description: `Scheduled evaluation for ${evaluationTitle}`,
      startDate: evaluationDate,
      type: "evaluation",
      relatedId: evaluationId,
    });
  }
}

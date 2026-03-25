import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
} from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventsResponse,
} from "@rfpinator/shared";

@Controller("calendar")
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  constructor(private readonly calendarService: CalendarService) {}

  /**
   * GET /calendar/events
   * Get calendar events, optionally filtered by month/year
   */
  @Get("events")
  async getEvents(
    @Query("month") month?: string,
    @Query("year") year?: string,
  ): Promise<CalendarEventsResponse> {
    this.logger.log(`Getting calendar events for ${month}/${year}`);
    
    const events = await this.calendarService.getEvents({
      month: month ? parseInt(month, 10) : undefined,
      year: year ? parseInt(year, 10) : undefined,
    });

    return { events };
  }

  /**
   * GET /calendar/events/:id
   * Get a specific calendar event
   */
  @Get("events/:id")
  async getEvent(@Param("id") id: string): Promise<CalendarEvent> {
    this.logger.log(`Getting calendar event: ${id}`);
    return this.calendarService.getEvent(id);
  }

  /**
   * POST /calendar/events
   * Create a new calendar event
   */
  @Post("events")
  async createEvent(
    @Body() createEventRequest: CreateCalendarEventRequest,
  ): Promise<CalendarEvent> {
    this.logger.log(`Creating calendar event: ${createEventRequest.title}`);
    return this.calendarService.createEvent(createEventRequest);
  }

  /**
   * PUT /calendar/events/:id
   * Update an existing calendar event
   */
  @Put("events/:id")
  async updateEvent(
    @Param("id") id: string,
    @Body() updateEventRequest: Omit<UpdateCalendarEventRequest, "id">,
  ): Promise<CalendarEvent> {
    this.logger.log(`Updating calendar event: ${id}`);
    return this.calendarService.updateEvent({ ...updateEventRequest, id });
  }

  /**
   * DELETE /calendar/events/:id
   * Delete a calendar event
   */
  @Delete("events/:id")
  async deleteEvent(@Param("id") id: string): Promise<{ success: boolean }> {
    this.logger.log(`Deleting calendar event: ${id}`);
    await this.calendarService.deleteEvent(id);
    return { success: true };
  }
}

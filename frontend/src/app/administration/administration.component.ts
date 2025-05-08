/*
 * Copyright (c) 2014-2024 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { UserDetailsComponent } from '../user-details/user-details.component'
import { FeedbackDetailsComponent } from '../feedback-details/feedback-details.component'
import { MatDialog } from '@angular/material/dialog'
import { FeedbackService } from '../Services/feedback.service'
import { MatTableDataSource } from '@angular/material/table'
import { UserService } from '../Services/user.service'
import { Component, type OnInit, ViewChild } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser' // SafeHtml can be removed if not used elsewhere for bypassSecurityTrustHtml
import { library } from '@fortawesome/fontawesome-svg-core'
import { faArchive, faEye, faHome, faTrashAlt, faUser } from '@fortawesome/free-solid-svg-icons'
import { MatPaginator } from '@angular/material/paginator'

library.add(faUser, faEye, faHome, faArchive, faTrashAlt)

@Component({
  selector: 'app-administration',
  templateUrl: './administration.component.html',
  styleUrls: ['./administration.component.scss']
})
export class AdministrationComponent implements OnInit {
  public userDataSource: any // Consider typing more strictly, e.g., MatTableDataSource<UserType>
  public userDataSourceHidden: any // Consider typing
  public userColumns = ['user', 'email', 'user_detail']
  public feedbackDataSource: any // Consider typing, e.g., MatTableDataSource<FeedbackType>
  public feedbackColumns = ['user', 'comment', 'rating', 'remove']
  public error: any
  public resultsLengthUser = 0
  public resultsLengthFeedback = 0
  @ViewChild('paginatorUsers') paginatorUsers: MatPaginator
  @ViewChild('paginatorFeedb') paginatorFeedb: MatPaginator

  constructor (
    private readonly dialog: MatDialog,
    private readonly userService: UserService,
    private readonly feedbackService: FeedbackService,
    private readonly sanitizer: DomSanitizer // Sanitizer might still be needed for other purposes, or can be removed if not.
  ) {}

  ngOnInit () {
    this.findAllUsers()
    this.findAllFeedbacks()
  }

  findAllUsers () {
    this.userService.find().subscribe((users: any[]) => { // Explicitly type users if possible
      this.userDataSource = users
      this.userDataSourceHidden = users // Consider if this separate property is still needed or if it can be derived
      for (const user of this.userDataSource) {
        // The email sanitization was already present. Ensure this HTML structure is intended and safe.
        // If user.email itself can contain HTML, it might also be a vector.
        // However, the original question was about line 64 (feedback.comment).
        user.email = this.sanitizer.bypassSecurityTrustHtml(`<span class="${this.doesUserHaveAnActiveSession(user) ? 'confirmation' : 'error'}">${user.email}</span>`)
      }
      this.userDataSource = new MatTableDataSource(this.userDataSource)
      this.userDataSource.paginator = this.paginatorUsers
      this.resultsLengthUser = users.length
    }, (err) => {
      this.error = err
      console.error('Error fetching users:', this.error) // Log as error
    })
  }

  findAllFeedbacks () {
    this.feedbackService.find().subscribe((feedbacks: any[]) => { // Explicitly type feedbacks if possible
      this.feedbackDataSource = feedbacks
      for (const feedback of this.feedbackDataSource) {
        // FIX: Remove bypassSecurityTrustHtml.
        // Let Angular's default sanitization handle the comment when it's bound in the template.
        // feedback.comment remains as a plain string.
        // No change needed here if feedback.comment is just a string.
        // If feedback.comment was intended to be SafeHtml, this line would be:
        // feedback.comment = feedback.comment; // (no sanitization bypass)
      }
      this.feedbackDataSource = new MatTableDataSource(this.feedbackDataSource)
      this.feedbackDataSource.paginator = this.paginatorFeedb
      this.resultsLengthFeedback = feedbacks.length
    }, (err) => {
      this.error = err
      console.error('Error fetching feedbacks:', this.error) // Log as error
    })
  }

  deleteFeedback (id: number) {
    this.feedbackService.del(id).subscribe(() => {
      this.findAllFeedbacks()
    }, (err) => {
      this.error = err
      console.error('Error deleting feedback:', this.error) // Log as error
    })
  }

  showUserDetail (id: number) {
    this.dialog.open(UserDetailsComponent, {
      data: {
        id
      }
    })
  }

  showFeedbackDetails (feedback: any, id: number) { // Consider typing feedback
    this.dialog.open(FeedbackDetailsComponent, {
      data: {
        feedback,
        id
      }
    })
  }

  times (numberOfTimes: number): string[] { // Added return type
    return Array(numberOfTimes).fill('★')
  }

  // Assuming user object has email and lastLoginTime properties.
  doesUserHaveAnActiveSession (user: { email: string, lastLoginTime?: number }): boolean { // Added return type and made lastLoginTime optional for safety
    const SIX_HOURS_IN_SECONDS = 60 * 60 * 6
    return !!(user.lastLoginTime && user.lastLoginTime > ((Date.now() / 1000) - SIX_HOURS_IN_SECONDS))
  }
}

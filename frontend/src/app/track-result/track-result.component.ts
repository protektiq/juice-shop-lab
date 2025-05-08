/*
 * Copyright (c) 2014-2024 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { ActivatedRoute } from '@angular/router'
import { MatTableDataSource } from '@angular/material/table'
import { Component, type OnInit } from '@angular/core'
import { TrackOrderService } from '../Services/track-order.service'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser' // SafeHtml can be removed if DomSanitizer is not used for bypassSecurityTrustHtml
import { library } from '@fortawesome/fontawesome-svg-core'
import { faHome, faSync, faTruck, faTruckLoading, faWarehouse } from '@fortawesome/free-solid-svg-icons'

library.add(faWarehouse, faSync, faTruckLoading, faTruck, faHome)

export enum Status {
  New,
  Packing,
  Transit,
  Delivered
}

// Define a more specific type for your order results if possible
interface OrderResult {
  orderId: string;
  email?: string; // Mark as optional if it might not always be present
  totalPrice?: number;
  products?: any[]; // Define a Product type if possible
  eta?: number | string;
  bonus?: any; // Define a Bonus type if possible
  delivered?: boolean;
}

interface TrackOrderResponse {
  data: OrderResult[];
}

@Component({
  selector: 'app-track-result',
  templateUrl: './track-result.component.html',
  styleUrls: ['./track-result.component.scss']
})
export class TrackResultComponent implements OnInit {
  public displayedColumns = ['product', 'price', 'quantity', 'total price']
  public dataSource = new MatTableDataSource<any>() // Consider using a specific type for products
  public orderId?: string
  public results: any = {} // Consider creating a specific interface for results display model
  public status: Status = Status.New
  public Status = Status // Expose enum to template

  // DomSanitizer might not be needed anymore if no bypassSecurityTrustHtml calls remain.
  constructor (
    private readonly route: ActivatedRoute,
    private readonly trackOrderService: TrackOrderService,
    private readonly sanitizer: DomSanitizer
  ) {}

  ngOnInit () {
    this.orderId = this.route.snapshot.queryParams.id
    if (this.orderId) { // Ensure orderId is present before making the call
      this.trackOrderService.find(this.orderId).subscribe(
        (response: TrackOrderResponse) => { // Use the defined interface for the response
          if (response && response.data && response.data.length > 0) {
            const orderData = response.data[0]

            // FIX: Store the raw orderId. Do not use bypassSecurityTrustHtml.
            // The <code> tags should be handled in the template.
            // For example, in your HTML: <code>{{ results.orderNo }}</code>
            this.results.orderNo = orderData.orderId

            this.results.email = orderData.email
            this.results.totalPrice = orderData.totalPrice
            this.results.products = orderData.products || [] // Default to empty array if undefined
            this.results.eta = orderData.eta !== undefined ? orderData.eta : '?'
            this.results.bonus = orderData.bonus
            this.dataSource.data = this.results.products

            if (orderData.delivered) {
              this.status = Status.Delivered
            } else if (this.route.snapshot.data.type) { // Assuming 'type' in route data is relevant
              this.status = Status.New
            } else if (typeof this.results.eta === 'number' && this.results.eta > 2) {
              this.status = Status.Packing
            } else {
              this.status = Status.Transit
            }
          } else {
            console.error('No order data found for ID:', this.orderId)
            // Handle UI for no data found, e.g., show a message
            this.results.orderNo = 'Order not found' // Or some other indicator
          }
        },
        (error) => {
          console.error('Error fetching order details:', error)
          // Handle error in UI, e.g., show an error message
          this.results.orderNo = 'Error fetching order' // Or some other indicator
        }
      )
    } else {
      console.warn('No order ID provided in query params.')
      // Handle UI for missing order ID
      this.results.orderNo = 'No order ID specified'
    }
  }
}

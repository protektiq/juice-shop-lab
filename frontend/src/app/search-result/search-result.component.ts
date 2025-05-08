/*
 * Copyright (c) 2014-2024 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { ProductDetailsComponent } from '../product-details/product-details.component'
import { ActivatedRoute, Router } from '@angular/router'
import { ProductService } from '../Services/product.service'
import { BasketService } from '../Services/basket.service'
import { type AfterViewInit, Component, NgZone, type OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core'
import { MatPaginator } from '@angular/material/paginator'
import { forkJoin, type Subscription } from 'rxjs'
import { MatTableDataSource } from '@angular/material/table'
import { MatDialog } from '@angular/material/dialog'
// DomSanitizer and SafeHtml might not be needed if no bypassSecurityTrustHtml calls remain.
// If DomSanitizer is still injected but not used for bypassing, it's fine.
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser'
import { TranslateService } from '@ngx-translate/core'
import { SocketIoService } from '../Services/socket-io.service'
import { SnackBarHelperService } from '../Services/snack-bar-helper.service'

import { library } from '@fortawesome/fontawesome-svg-core'
import { faCartPlus, faEye } from '@fortawesome/free-solid-svg-icons'
import { type Product } from '../Models/product.model' // Assuming Product type is defined
import { QuantityService } from '../Services/quantity.service'
import { DeluxeGuard } from '../app.guard'

library.add(faEye, faCartPlus)

interface TableEntry {
  name: string
  price: number
  deluxePrice: number // Assuming this is the correct type
  id: number
  image: string
  description: string // This will now hold plain text
  quantity?: number
}

// Define a more specific type for Product if not already available globally
// interface Product {
//   name: string;
//   price: number;
//   deluxePrice: number;
//   id: number;
//   image: string;
//   description: string;
// }

interface Quantity {
  ProductId: number;
  quantity: number;
}

@Component({
  selector: 'app-search-result',
  templateUrl: './search-result.component.html',
  styleUrls: ['./search-result.component.scss']
})
export class SearchResultComponent implements OnDestroy, AfterViewInit {
  public displayedColumns = ['Image', 'Product', 'Description', 'Price', 'Select']
  public tableData!: Product[] // Changed from any[] to Product[]
  public pageSizeOptions: number[] = []
  public dataSource!: MatTableDataSource<TableEntry>
  public gridDataSource!: any // Consider a more specific type if possible
  public searchValue?: string // Changed from SafeHtml to string
  public resultsLength = 0
  @ViewChild(MatPaginator, { static: true }) paginator: MatPaginator | null = null
  private productSubscription?: Subscription
  private routerSubscription?: Subscription
  public breakpoint: number = 6
  public emptyState = false

  constructor (
    private readonly deluxeGuard: DeluxeGuard,
    private readonly dialog: MatDialog,
    private readonly productService: ProductService,
    private readonly quantityService: QuantityService,
    private readonly basketService: BasketService,
    private readonly translateService: TranslateService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly sanitizer: DomSanitizer, // May not be needed if no bypass calls remain
    private readonly ngZone: NgZone,
    private readonly io: SocketIoService,
    private readonly snackBarHelperService: SnackBarHelperService,
    private readonly cdRef: ChangeDetectorRef
  ) { }

  ngAfterViewInit () {
    const productsObservable = this.productService.search('') // Assuming this returns Observable<Product[]>
    const quantitiesObservable = this.quantityService.getAll() // Assuming this returns Observable<Quantity[]>

    forkJoin([quantitiesObservable, productsObservable]).subscribe(([quantities, products]) => {
      const dataTable: TableEntry[] = []
      this.tableData = products
      // FIX for line 71: Call the corrected processProductDescriptions method
      this.processProductDescriptions(products)
      for (const product of products) {
        dataTable.push({
          name: product.name,
          price: product.price,
          deluxePrice: product.deluxePrice,
          id: product.id,
          image: product.image,
          description: product.description // Description is now plain text
        })
      }
      for (const quantity of quantities) {
        const entry = dataTable.find((dataTableEntry) => {
          return dataTableEntry.id === quantity.ProductId
        })
        if (entry === undefined) {
          continue
        }
        entry.quantity = quantity.quantity
      }
      this.dataSource = new MatTableDataSource<TableEntry>(dataTable)
      this.pageSizeOptions = [] // Clear previous options
      for (let i = 1; i <= Math.ceil(this.dataSource.data.length / 12); i++) {
        this.pageSizeOptions.push(i * 12)
      }
      if (this.paginator) { // Check if paginator is initialized
        this.paginator.pageSizeOptions = this.pageSizeOptions
        this.dataSource.paginator = this.paginator
      }
      this.gridDataSource = this.dataSource.connect() // connect() returns an Observable
      this.resultsLength = this.dataSource.data.length
      this.filterTable()
      this.routerSubscription = this.router.events.subscribe(() => {
        this.filterTable()
      })
      const challenge: string = this.route.snapshot.queryParams.challenge
      if (challenge && this.route.snapshot.url.join('').match(/hacking-instructor/)) {
        this.startHackingInstructor(decodeURIComponent(challenge))
      }
      this.updateBreakpoint() // Extracted breakpoint logic
      this.cdRef.detectChanges()
    }, (err) => {
      console.error('Error fetching initial data:', err) // Log error
    })
  }

  /**
   * Processes product descriptions.
   * FIX for line 125: Removed bypassSecurityTrustHtml.
   * Descriptions are now treated as plain text.
   * If HTML is absolutely required in descriptions, it must be sanitized *before* reaching this component,
   * or handled with extreme care in the template using [innerHTML] only with pre-sanitized, trusted HTML.
   * @param tableData Array of products
   */
  processProductDescriptions (tableData: Product[]) {
    // The loop is still here, but the dangerous sanitization bypass is removed.
    // tableData[i].description will retain its original string form.
    // Angular's template bindings (e.g., {{ product.description }}) will then safely render it as text.
    for (let i = 0; i < tableData.length; i++) {
      // tableData[i].description = this.sanitizer.bypassSecurityTrustHtml(tableData[i].description); // VULNERABLE LINE REMOVED
      // No operation needed here anymore if description is to be plain text.
    }
  }

  ngOnDestroy () {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe()
    }
    if (this.productSubscription) {
      this.productSubscription.unsubscribe()
    }
    if (this.dataSource) {
      this.dataSource.disconnect() // Disconnect the MatTableDataSource
    }
    if (this.gridDataSource && typeof this.gridDataSource.unsubscribe === 'function') {
      this.gridDataSource.unsubscribe(); // If gridDataSource is a subscription
    }
  }

  filterTable () {
    let queryParam: string | null = this.route.snapshot.queryParams.q // queryParams can be null
    if (queryParam) {
      queryParam = queryParam.trim()
      this.ngZone.runOutsideAngular(() => {
        this.io.socket().emit('verifyLocalXssChallenge', queryParam)
      })
      this.dataSource.filter = queryParam.toLowerCase()
      // FIX for line 151: Assign the raw queryParam to searchValue.
      // Do not use bypassSecurityTrustHtml.
      // In the template, use {{ searchValue }} for safe rendering.
      this.searchValue = queryParam
      this.gridDataSource.subscribe((result: any[]) => { // Assuming result is an array
        if (result.length === 0) {
          this.emptyState = true
        } else {
          this.emptyState = false
        }
      })
    } else {
      this.dataSource.filter = ''
      this.searchValue = undefined // Keep as undefined or empty string
      this.emptyState = false
    }
  }

  startHackingInstructor (challengeName: string) {
    console.log(`Starting instructions for challenge "${challengeName}"`)
    import(/* webpackChunkName: "tutorial" */ '../../hacking-instructor').then(module => {
      module.startHackingInstructorFor(challengeName)
    }).catch(err => console.error('Error loading hacking instructor module', err)); // Add catch for import
  }

  showDetail (element: Product) {
    this.dialog.open(ProductDetailsComponent, {
      width: '500px',
      height: 'max-content',
      data: {
        productData: element
      }
    })
  }

  addToBasket (id?: number) {
    if (id === undefined) {
      console.error('Product ID is undefined, cannot add to basket.');
      return;
    }
    const basketId = sessionStorage.getItem('bid');
    if (!basketId) {
      console.error('Basket ID not found in session storage.');
      // Potentially handle this by creating a basket or prompting login
      return;
    }

    this.basketService.find(Number(basketId)).subscribe((basket) => {
      const productsInBasket: any[] = basket.Products || []; // Default to empty array
      let found = false;
      for (let i = 0; i < productsInBasket.length; i++) {
        if (productsInBasket[i].id === id) {
          found = true;
          const basketItem = productsInBasket[i].BasketItem;
          if (!basketItem || basketItem.id === undefined) {
            console.error('BasketItem or BasketItem.id is undefined.');
            continue; // Skip this item or handle error appropriately
          }
          this.basketService.get(basketItem.id).subscribe((existingBasketItem) => {
            const newQuantity = existingBasketItem.quantity + 1;
            this.basketService.put(existingBasketItem.id, { quantity: newQuantity }).subscribe((updatedBasketItem) => {
              this.productService.get(updatedBasketItem.ProductId).subscribe((product) => {
                this.translateService.get('BASKET_ADD_SAME_PRODUCT', { product: product.name }).subscribe((basketAddSameProduct) => {
                  this.snackBarHelperService.open(basketAddSameProduct, 'confirmBar');
                  this.basketService.updateNumberOfCartItems();
                }, (translationId) => { // Error case for translation
                  this.snackBarHelperService.open(translationId, 'confirmBar');
                  this.basketService.updateNumberOfCartItems();
                });
              }, (err) => { console.error('Error fetching product details:', err); });
            }, (err) => {
              this.snackBarHelperService.open(err.error?.error || 'Error updating basket item.', 'errorBar');
              console.error('Error updating basket item:', err);
            });
          }, (err) => { console.error('Error fetching existing basket item:', err); });
          break;
        }
      }
      if (!found) {
        this.basketService.save({ ProductId: id, BasketId: basketId, quantity: 1 }).subscribe((newBasketItem) => {
          this.productService.get(newBasketItem.ProductId).subscribe((product) => {
            this.translateService.get('BASKET_ADD_PRODUCT', { product: product.name }).subscribe((basketAddProduct) => {
              this.snackBarHelperService.open(basketAddProduct, 'confirmBar');
              this.basketService.updateNumberOfCartItems();
            }, (translationId) => { // Error case for translation
              this.snackBarHelperService.open(translationId, 'confirmBar');
              this.basketService.updateNumberOfCartItems();
            });
          }, (err) => { console.error('Error fetching product details for new item:', err); });
        }, (err) => {
          this.snackBarHelperService.open(err.error?.error || 'Error saving new basket item.', 'errorBar');
          console.error('Error saving new basket item:', err);
        });
      }
    }, (err) => {
      console.error('Error finding basket:', err);
      // Handle basket not found or other errors
    });
  }

  isLoggedIn (): boolean { // Added return type
    return !!localStorage.getItem('token'); // More explicit boolean conversion
  }

  // Extracted breakpoint logic for clarity
  updateBreakpoint () {
    const width = window.innerWidth;
    if (width < 850) {
      this.breakpoint = 1;
    } else if (width < 1280) {
      this.breakpoint = 2;
    } else if (width < 1740) {
      this.breakpoint = 3;
    } else if (width < 2600) {
      this.breakpoint = 4;
    } else {
      this.breakpoint = 6;
    }
  }

  // Renamed onResize to avoid conflict with potential native event handlers if not intended
  handleResize (event: any) { // Consider using HostListener for window:resize
    this.updateBreakpoint();
  }

  isDeluxe (): boolean { // Added return type
    return this.deluxeGuard.isDeluxe();
  }
}

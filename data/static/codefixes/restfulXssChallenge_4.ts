import { ChangeDetectorRef, AfterViewInit, Component, ViewChild, NgZone } from '@angular/core' // Added NgZone, ChangeDetectorRef
import { DomSanitizer, SafeScript } from '@angular/platform-browser' // SafeScript can be removed
import { MatTableDataSource } from '@angular/material/table'
import { MatPaginator } from '@angular/material/paginator' // Assuming MatPaginator is used
import { forkJoin, Subscription } from 'rxjs' // Assuming Subscription is used
import { Router } from '@angular/router' // Assuming Router is used
import { ProductService } from '../Services/product.service' // Assuming ProductService
import { QuantityService } from '../Services/quantity.service' // Assuming QuantityService

// Mockup for TableEntry, replace with your actual definition
interface TableEntry {
  name: string
  price: number
  deluxePrice?: number // Made optional as it might not always be there
  id: number
  image: string
  description: string // This will now hold plain text or sanitized HTML, not SafeScript
  quantity?: number // Made optional
}

// Mockup for Product, replace with your actual definition
interface Product {
  name: string
  price: number
  deluxePrice?: number
  id: number
  image: string
  description: string
}

// Mockup for Quantity, replace with your actual definition
interface Quantity {
  ProductId: number
  quantity: number
}

@Component({
  selector: 'app-restful-xss-challenge', // Example selector
  templateUrl: './restful-xss-challenge.component.html', // Example template URL
  styleUrls: ['./restful-xss-challenge.component.scss'] // Example style URL
})
export class RestfulXssChallenge4Component implements AfterViewInit { // Renamed class for clarity
  // Mocking properties that are likely part of the component
  public dataSource: MatTableDataSource<TableEntry>
  public gridDataSource: any // Consider more specific type
  public tableData: Product[] = []
  public pageSizeOptions: number[] = []
  public resultsLength: number = 0
  public breakpoint: number = 4 // Default breakpoint
  private routerSubscription: Subscription | undefined

  @ViewChild(MatPaginator) paginator: MatPaginator

  constructor (
    private productService: ProductService,
    private quantityService: QuantityService,
    private sanitizer: DomSanitizer, // Sanitizer can be removed if no bypassSecurityTrust... methods are used
    private router: Router,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone // Added NgZone if needed for router events outside Angular zone
  ) {
    this.dataSource = new MatTableDataSource<TableEntry>([])
  }

  ngAfterViewInit () {
    const productsObservable = this.productService.search('') // Assuming search returns Observable<Product[]>
    const quantitiesObservable = this.quantityService.getAll() // Assuming getAll returns Observable<Quantity[]>

    forkJoin([quantitiesObservable, productsObservable]).subscribe(([quantities, products]) => {
      const dataTable: TableEntry[] = []
      this.tableData = products
      // Call the corrected trustProductDescription method
      this.processProductDescriptions(products) // Changed method name for clarity

      for (const product of products) {
        dataTable.push({
          name: product.name,
          price: product.price,
          deluxePrice: product.deluxePrice,
          id: product.id,
          image: product.image,
          description: product.description // Description is now plain text or pre-sanitized HTML
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
      this.pageSizeOptions = [] // Reset before populating
      for (let i = 1; i <= Math.ceil(this.dataSource.data.length / 12); i++) {
        this.pageSizeOptions.push(i * 12)
      }
      if (this.paginator) {
        this.paginator.pageSizeOptions = this.pageSizeOptions
        this.dataSource.paginator = this.paginator
      }

      this.gridDataSource = this.dataSource.connect()
      this.resultsLength = this.dataSource.data.length
      this.filterTable() // Assuming this method exists

      // It's good practice to manage subscriptions and unsubscribe on component destroy
      this.routerSubscription = this.router.events.subscribe(() => {
        // Use NgZone.run if filterTable causes issues due to running outside Angular zone
        this.ngZone.run(() => this.filterTable())
      })

      this.updateBreakpoint() // Extracted breakpoint logic to a method
      this.cdRef.detectChanges()
    }, (err) => { console.error('Error fetching products or quantities:', err) }) // Log as error
  }

  // Assuming filterTable method exists
  filterTable () {
    // Placeholder for actual filter logic
    // e.g., this.dataSource.filter = ...
    console.log('filterTable called')
  }

  updateBreakpoint () {
    if (window.innerWidth < 850) {
      this.breakpoint = 1
    } else if (window.innerWidth < 1280) {
      this.breakpoint = 2
    } else if (window.innerWidth < 1740) {
      this.breakpoint = 3
    } else if (window.innerWidth < 2600) {
      this.breakpoint = 4
    } else {
      this.breakpoint = 6
    }
  }

  /**
   * Processes product descriptions.
   * FIX: Removed bypassSecurityTrustScript. Descriptions are treated as plain text.
   * If HTML is needed in descriptions, it must be sanitized *before* reaching this point,
   * or handled carefully in the template with [innerHTML] and further sanitization if necessary.
   * For now, we assume descriptions are plain strings.
   * @param tableData Array of products
   */
  processProductDescriptions (tableData: Product[]) {
    for (let i = 0; i < tableData.length; i++) {
      // The vulnerable line is removed.
      // tableData[i].description remains as a plain string.
      // No sanitization bypass is applied here.
      // If tableData[i].description is intended to be displayed as HTML,
      // ensure it's either pre-sanitized or use Angular's built-in mechanisms
      // carefully in the template (e.g., {{ }} for text, [innerHTML] for HTML after scrutiny).
    }
  }

  // It's good practice to unsubscribe from observables to prevent memory leaks
  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
    if (this.dataSource) {
      this.dataSource.disconnect(); // Disconnect the MatTableDataSource
    }
  }
}

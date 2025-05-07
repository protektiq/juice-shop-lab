import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'; // Assuming DomSanitizer is imported
import { ActivatedRoute } from '@angular/router'; // Assuming ActivatedRoute is imported
import { MatTableDataSource } from '@angular/material/table'; // Assuming MatTableDataSource is used
import { Observable } from 'rxjs'; // Assuming Observable is used

// Mocking necessary properties and types for context, replace with actual imports/definitions
class YourComponent {
  route: ActivatedRoute;
  sanitizer: DomSanitizer;
  dataSource: MatTableDataSource<any>; // Replace 'any' with your data source type
  searchValue: string | undefined; // Changed from SafeResourceUrl to string, or keep as any if mixed types are possible
  gridDataSource: Observable<any[]>; // Replace 'any[]' with your data source type
  emptyState: boolean = false;

  constructor(route: ActivatedRoute, sanitizer: DomSanitizer, /* other dependencies */) {
    this.route = route;
    this.sanitizer = sanitizer;
    // Initialize dataSource and gridDataSource appropriately
    this.dataSource = new MatTableDataSource();
    this.gridDataSource = new Observable<any[]>(); // Placeholder
  }

  filterTable () {
    let queryParam: string | null = this.route.snapshot.queryParams.q; // queryParams.q can be null
    if (queryParam) {
      queryParam = queryParam.trim();
      this.dataSource.filter = queryParam.toLowerCase();

      // FIX: Assign the raw queryParam. Angular's template binding will handle sanitization.
      // Do not use bypassSecurityTrustResourceUrl with untrusted user input.
      this.searchValue = queryParam;

      this.gridDataSource.subscribe((result: any) => {
        if (result.length === 0) {
          this.emptyState = true;
        } else {
          this.emptyState = false;
        }
      });
    } else {
      this.dataSource.filter = '';
      this.searchValue = undefined;
      this.emptyState = false;
    }
  }
}

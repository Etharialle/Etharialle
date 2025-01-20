import pandas as pd

url = "https://docs.google.com/document/d/e/2PACX-1vQGUck9HIFCyezsrBSnmENk5ieJuYwpt7YHYEzeNJkIb9OSDdx-ov2nRNReKQyey-cwJOoEKUhLmN9z/pub"

def print_secret_code(url):
    table_data = pd.read_html(url, header=0, flavor='bs4')

    table_data_sorted = table_data[0].sort_values(by=["y-coordinate","x-coordinate"], ignore_index=True)
    print(table_data_sorted.head(25))
    xcoord = table_data_sorted['x-coordinate']
    ycoord = table_data_sorted['y-coordinate']
    char = table_data_sorted['Character']
    

    for i in range(1, len(ycoord)):
        if xcoord[i] - xcoord[i - 1] != 1:
            print(" " * int((xcoord[i]) - (xcoord[i - 1]) - 1), end='')
        if (ycoord[i] != (ycoord[i - 1])):
            print('\r')
        print (char[i], end='') 
    print()

print_secret_code(url)